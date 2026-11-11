package id.lumi.transport;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.security.SecureRandom;

import javax.net.ssl.SSLSocketFactory;

/**
 * WebSocket client minimal (RFC 6455) untuk feed posisi bus. Byte MQTT diteruskan apa adanya ke
 * live.js (yang mengurus protokol MQTT). Koneksi native dipakai karena lebih andal daripada
 * WebSocket di WebView; saringan rute juga dikerjakan di sini supaya pesan rute lain tidak
 * pernah menyeberang ke JS.
 *
 * Catatan: broker armada TJ menerima koneksi anonim hanya bila client ID diawali "mqttjs_"
 * (lihat live.js). Header User-Agent tetap milik Lumi (AppInfo.userAgent(), dari versionName).
 */
public class LiveSocket {
    public interface Listener {
        void onOpen();
        void onData(byte[] data);
        void onClose(String reason);
    }

    private final String url;
    private final Listener listener;
    private Socket socket;
    private OutputStream out;
    private volatile boolean closed;
    private final SecureRandom rnd = new SecureRandom();
    /** Kode rute yang diinginkan (dinormalisasi); null = teruskan semua. Pesan rute lain dibuang di sini. */
    public volatile java.util.Set<String> filter;
    public volatile long bytesIn;
    private final ByteArrayOutputStream mq = new ByteArrayOutputStream();

    static String norm(String c) { return c == null ? "" : c.toUpperCase(java.util.Locale.US).replace(".", "").replace("-", "").replace(" ", ""); }

    /** Pecah aliran byte MQTT menjadi paket; buang PUBLISH rute yang tidak diminta. */
    /** Sisa paket MQTT yang belum utuh tidak boleh menumpuk tanpa batas (aliran rusak) — B-10. */
    static final int MAX_PENDING = 1024 * 1024;

    private void deliver(byte[] data) throws IOException {
        bytesIn += data.length;
        mq.write(data, 0, data.length);
        if (mq.size() > MAX_PENDING) { mq.reset(); throw new IOException("aliran MQTT tidak sah"); }
        byte[] b = mq.toByteArray();
        int pos = 0;
        ByteArrayOutputStream keep = new ByteArrayOutputStream();
        while (true) {
            if (b.length - pos < 2) break;
            int mult = 1, len = 0, i = pos + 1, d;
            boolean ok = true;
            do {
                if (i >= b.length) { ok = false; break; }
                d = b[i++] & 0xFF; len += (d & 127) * mult; mult *= 128;
            } while ((d & 128) != 0);
            if (!ok || b.length < i + len) break;
            int type = (b[pos] & 0xFF) >> 4;
            boolean forward = true;
            java.util.Set<String> f = filter;
            if (type == 3 && f != null && len >= 2) {
                int tl = ((b[i] & 0xFF) << 8) | (b[i + 1] & 0xFF);
                if (tl <= len - 2) {
                    String topic;
                    try { topic = new String(b, i + 2, tl, "UTF-8"); } catch (Exception e) { topic = ""; }
                    String[] seg = topic.split("/");
                    forward = seg.length > 3 && f.contains(norm(seg[3]));
                }
            }
            if (forward) keep.write(b, pos, (i + len) - pos);
            pos = i + len;
        }
        mq.reset();
        if (pos < b.length) mq.write(b, pos, b.length - pos);
        if (keep.size() > 0) listener.onData(keep.toByteArray());
    }

    public LiveSocket(String url, Listener l) { this.url = url; this.listener = l; }

    public void start() {
        Thread t = new Thread(new Runnable() { @Override public void run() { runLoop(); } }, "lumi-live");
        t.setDaemon(true);
        t.start();
    }

    private void runLoop() {
        String reason = Lang.t("tertutup", "closed");
        try {
            URI u = new URI(url);
            boolean tls = "wss".equalsIgnoreCase(u.getScheme());
            int port = u.getPort() > 0 ? u.getPort() : (tls ? 443 : 80);
            String path = (u.getRawPath() == null || u.getRawPath().isEmpty()) ? "/" : u.getRawPath();
            Socket raw = new Socket();
            raw.connect(new InetSocketAddress(u.getHost(), port), 12000);
            Socket s = raw;
            if (tls) {
                // TLS dengan SNI + verifikasi nama host (SSLSocketFactory tidak memverifikasinya sendiri)
                javax.net.ssl.SSLSocket ss = (javax.net.ssl.SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault())
                        .createSocket(raw, u.getHost(), port, true);
                ss.startHandshake();
                if (!javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier().verify(u.getHost(), ss.getSession()))
                    throw new javax.net.ssl.SSLException("sertifikat tidak cocok dengan " + u.getHost());
                s = ss;
            }
            s.setSoTimeout(90000);
            socket = s;
            out = s.getOutputStream();
            InputStream in = s.getInputStream();
            byte[] key = new byte[16];
            rnd.nextBytes(key);
            String k64 = android.util.Base64.encodeToString(key, android.util.Base64.NO_WRAP);
            String req = "GET " + path + " HTTP/1.1\r\n" +
                    "Host: " + u.getHost() + ":" + port + "\r\n" +
                    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
                    "Sec-WebSocket-Key: " + k64 + "\r\n" +
                    "Sec-WebSocket-Version: 13\r\n" +
                    "Sec-WebSocket-Protocol: mqtt\r\n" +
                    "User-Agent: " + AppInfo.userAgent() + "\r\n\r\n";
            out.write(req.getBytes("UTF-8"));
            out.flush();
            String status = readHeaders(in);
            if (status == null || !status.contains(" 101")) {
                reason = Lang.t("server menolak: ", "server refused: ") + (status == null ? Lang.t("tanpa jawaban", "no response") : status.trim());
                return;
            }
            listener.onOpen();
            ByteArrayOutputStream msg = new ByteArrayOutputStream();
            while (!closed) {
                int b0 = in.read();
                if (b0 < 0) { reason = Lang.t("koneksi diputus server", "connection dropped by server"); break; }
                int b1 = in.read();
                if (b1 < 0) break;
                int op = b0 & 0x0F;
                boolean fin = (b0 & 0x80) != 0;
                long len = payloadLength(in, b1);
                byte[] mask = null;
                if ((b1 & 0x80) != 0) { mask = new byte[4]; readFully(in, mask); }
                if (len > 8 * 1024 * 1024) { reason = Lang.t("frame terlalu besar", "frame too large"); break; }
                byte[] payload = new byte[(int) len];
                readFully(in, payload);
                if (mask != null) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
                if (op == 0x8) {
                    int code = payload.length >= 2 ? ((payload[0] & 0xFF) << 8) | (payload[1] & 0xFF) : 0;
                    String txt = payload.length > 2 ? new String(payload, 2, payload.length - 2, "UTF-8") : "";
                    reason = Lang.t("server menutup koneksi", "server closed the connection") + (code > 0 ? Lang.t(" (kode ", " (code ") + code + (txt.isEmpty() ? "" : ": " + txt) + ")" : "");
                    break;
                }
                if (op == 0x9) { sendFrame(0xA, payload); continue; }
                if (op == 0xA) continue;
                if (op == 0x1 || op == 0x2 || op == 0x0) {
                    msg.write(payload);
                    if (msg.size() > 8 * 1024 * 1024) { reason = Lang.t("pesan terlalu besar", "message too large"); break; }
                    if (fin) { deliver(msg.toByteArray()); msg.reset(); }
                }
            }
        } catch (Exception e) {
            if (!closed) reason = e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
        } finally {
            try { if (socket != null) socket.close(); } catch (IOException ignored) { }
            if (!closed) listener.onClose(reason);
            closed = true;
            writer.shutdown();
        }
    }

    /**
     * Panjang payload frame dari byte kedua header. v2.17 (B-10): byte panjang tambahan dibaca dengan
     * readFully, jadi EOF di tengah header menjadi IOException (dulu -1 & 0xFF terbaca sebagai 255).
     */
    static long payloadLength(InputStream in, int b1) throws IOException {
        long len = b1 & 0x7F;
        if (len == 126) {
            byte[] x = new byte[2]; readFully(in, x);
            len = ((x[0] & 0xFF) << 8) | (x[1] & 0xFF);
        } else if (len == 127) {
            byte[] x = new byte[8]; readFully(in, x);
            len = 0;
            for (int i = 0; i < 8; i++) len = (len << 8) | (x[i] & 0xFF);
            if (len < 0) throw new IOException("panjang frame tidak sah");
        }
        return len;
    }

    static void readFully(InputStream in, byte[] b) throws IOException {
        int off = 0;
        while (off < b.length) {
            int n = in.read(b, off, b.length - off);
            if (n < 0) throw new IOException("EOF");
            off += n;
        }
    }

    /** Baca header respons HTTP; kembalikan baris status. */
    private static String readHeaders(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c, n = 0;
        while ((c = in.read()) >= 0) {
            sb.append((char) c);
            if (++n > 16384) break;
            int L = sb.length();
            if (L >= 4 && sb.charAt(L - 4) == '\r' && sb.charAt(L - 3) == '\n' && sb.charAt(L - 2) == '\r' && sb.charAt(L - 1) == '\n') break;
        }
        int e = sb.indexOf("\r\n");
        return e > 0 ? sb.substring(0, e) : null;
    }

    /**
     * Semua penulisan ke soket lewat satu thread penulis (v2.18.2). Dulu send()/close() menulis langsung di
     * thread pemanggil; BusWatchService memanggilnya dari thread utama (langganan MQTT, ping, berhenti)
     * sehingga Android melempar NetworkOnMainThreadException dan aplikasi tertutup saat pendampingan dimulai.
     */
    private final java.util.concurrent.ExecutorService writer = java.util.concurrent.Executors.newSingleThreadExecutor(
            new java.util.concurrent.ThreadFactory() {
                @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "lumi-live-write"); t.setDaemon(true); return t; }
            });

    private void onWriter(Runnable r) {
        try { writer.execute(r); } catch (java.util.concurrent.RejectedExecutionException ignored) { }   // sudah ditutup
    }

    /** Kirim satu frame biner. Aman dipanggil dari thread mana pun (termasuk thread utama). */
    public void send(final byte[] data) {
        if (closed) return;
        onWriter(new Runnable() { @Override public void run() {
            try { sendFrame(0x2, data); }
            catch (Exception e) {          // IOException, atau RuntimeException dari lapisan TLS
                boolean was = closed;
                shutdown();
                if (!was) listener.onClose(Lang.t("gagal mengirim", "send failed"));
            }
        }});
    }

    private synchronized void sendFrame(int op, byte[] data) throws IOException {
        if (out == null) return;
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | op);
        int len = data.length;
        if (len < 126) f.write(0x80 | len);
        else if (len < 65536) { f.write(0x80 | 126); f.write(len >> 8); f.write(len & 0xFF); }
        else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) ((long) len >> (8 * i)) & 0xFF); }
        byte[] mask = new byte[4];
        rnd.nextBytes(mask);
        f.write(mask);
        for (int i = 0; i < len; i++) f.write(data[i] ^ mask[i & 3]);
        out.write(f.toByteArray());
        out.flush();
    }

    /** Tutup koneksi. Aman dari thread mana pun: frame penutup & penutupan soket dikerjakan thread penulis. */
    public void close() {
        if (closed) return;
        closed = true;
        onWriter(new Runnable() { @Override public void run() {
            try { if (out != null) sendFrame(0x8, new byte[0]); } catch (Exception ignored) { }
            shutdown();
        }});
        writer.shutdown();
    }

    /** Dipanggil di thread penulis / pembaca saja (boleh menyentuh jaringan). */
    private void shutdown() {
        closed = true;
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
    }
}
