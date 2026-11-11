package id.lumi.transport;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * "Ikuti perjalananku" (v2.15): keluarga bisa melihat posisi pengguna sampai tiba, lewat tautan.
 *
 * Tanpa server Lumi: posisi dikirim ke relay pub/sub publik (default ntfy.sh, bisa diganti lewat
 * data/remote_config.json → share.relay) pada topik acak 128-bit. Isinya DIENKRIPSI ujung-ke-ujung
 * (AES-256-GCM); kuncinya hanya ada di bagian "#" tautan, yang tidak pernah dikirim peramban ke
 * server mana pun. Relay hanya melihat potongan teks acak. Halaman penampil (docs/ikuti/index.html,
 * di-host GitHub Pages) mengambil pesan dari relay dan mendekripsinya di peramban penerima.
 *
 * Berbagi berhenti otomatis saat pendampingan selesai/dihentikan (pesan terakhir "arrived"/"ended")
 * atau setelah 6 jam. Posisi dikirim tiap 15 detik bila bergerak (> 25 m), tiap 5 detik bila berpindah
 * jauh (> 150 m), saat fase berubah (jalan → naik → turun), dan minimal tiap 60 detik sebagai tanda hidup.
 */
public final class TripShare {
    private TripShare() { }

    static final String PREFS = "lumi_share";
    static final long MAX_MS = 6L * 60 * 60 * 1000, MIN_GAP_MS = 15000, HEARTBEAT_MS = 60000;
    static final String DEFAULT_RELAY = "https://ntfy.sh";
    static final String DEFAULT_VIEWER = "https://vamvicky.github.io/LumiTransport/ikuti/";
    private static final java.util.concurrent.ExecutorService NET = java.util.concurrent.Executors.newSingleThreadExecutor();

    private static long lastSentAt;
    private static double lastLat = Double.NaN, lastLon = Double.NaN;
    private static String lastPhase;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }


    /** Apakah sedang berbagi (dan belum kedaluwarsa). */
    public static boolean active(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("topic", null) != null && System.currentTimeMillis() - p.getLong("startedAt", 0) < MAX_MS;
    }

    /**
     * Mulai berbagi. relay/viewer boleh null (pakai bawaan); hanya https yang diterima.
     * Mengembalikan tautan penampil, mis. https://…/ikuti/#t=lumi-…&k=…&r=ntfy.sh
     */
    public static String start(Context c, String title, String toName, double toLat, double toLon, String relay, String viewer) {
        byte[] topic = ShareCrypto.random(16), key = ShareCrypto.random(32);
        String t = "lumi-" + ShareCrypto.hex(topic);
        String r = relay != null && relay.matches("https://[A-Za-z0-9.-]+(:\\d+)?/?") ? relay.replaceAll("/$", "") : DEFAULT_RELAY;
        String v = viewer != null && viewer.startsWith("https://") ? viewer : DEFAULT_VIEWER;
        prefs(c).edit().putString("topic", t).putString("key", ShareCrypto.b64url(key)).putString("relay", r)
                .putString("title", title).putString("to", toName).putFloat("toLat", (float) toLat).putFloat("toLon", (float) toLon)
                .putLong("startedAt", System.currentTimeMillis()).apply();
        lastSentAt = 0; lastLat = Double.NaN; lastPhase = null;
        String host = r.replaceFirst("^https://", "");
        String link = v + "#t=" + t + "&k=" + ShareCrypto.b64url(key) + (DEFAULT_RELAY.equals(r) ? "" : "&r=" + host);
        // Pesan pertama: tujuan & judul, supaya penerima langsung melihat sesuatu.
        send(c, "{\"v\":1,\"state\":\"start\",\"ts\":" + System.currentTimeMillis() + ",\"title\":" + q(title) + ",\"to\":" + q(toName) +
                ",\"toLat\":" + toLat + ",\"toLon\":" + toLon + "}");
        return link;
    }

    /** Dipanggil NavService di tiap posisi GPS selama pendampingan. */
    static void onGuide(Context c, GuideTracker.State s, double acc) {
        if (!active(c)) { if (prefs(c).getString("topic", null) != null) stop(c, false); return; }
        long now = System.currentTimeMillis();
        long gap = now - lastSentAt;
        double d = dist(lastLat, lastLon, s.lat, s.lon);
        boolean phaseChanged = s.phase != null && !s.phase.equals(lastPhase);
        boolean send = s.done || phaseChanged || gap >= HEARTBEAT_MS || (gap >= MIN_GAP_MS && d > 25) || (gap >= 5000 && d > 150);
        if (!send) return;
        lastSentAt = now; lastLat = s.lat; lastLon = s.lon; lastPhase = s.phase;
        SharedPreferences p = prefs(c);
        String body = "{\"v\":1,\"state\":" + q(s.done ? "arrived" : s.phase) + ",\"ts\":" + now +
                ",\"lat\":" + round(s.lat) + ",\"lon\":" + round(s.lon) + ",\"acc\":" + Math.round(acc) +
                ",\"title\":" + q(s.title) + ",\"text\":" + q(s.text) + ",\"stopsLeft\":" + s.stopsLeft +
                ",\"to\":" + q(p.getString("to", "")) + ",\"toLat\":" + p.getFloat("toLat", 0) + ",\"toLon\":" + p.getFloat("toLon", 0) + "}";
        send(c, body);
        if (s.done) stop(c, true);
    }

    /** Hentikan berbagi; arrived=true bila pendampingan selesai di tujuan. */
    public static void stop(Context c, boolean arrived) {
        SharedPreferences p = prefs(c);
        if (p.getString("topic", null) == null) return;
        if (!arrived) send(c, "{\"v\":1,\"state\":\"ended\",\"ts\":" + System.currentTimeMillis() + "}");
        // Topik & kunci dibuang (pesan terakhir sudah diantre dengan salinannya).
        p.edit().clear().apply();
    }

    static double round(double x) { return Math.round(x * 1e5) / 1e5; }
    static double dist(double la1, double lo1, double la2, double lo2) {
        if (Double.isNaN(la1)) return 1e9;
        double r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
        double h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
        return 2 * 6371000 * Math.asin(Math.sqrt(h));
    }
    static String q(String s) {
        StringBuilder sb = new StringBuilder();
        GtfsRt.q(sb, s == null ? "" : s);
        return sb.toString();
    }

    private static void send(Context c, final String json) {
        SharedPreferences p = prefs(c);
        final String topic = p.getString("topic", null), key = p.getString("key", null), relay = p.getString("relay", DEFAULT_RELAY);
        if (topic == null || key == null) return;
        NET.execute(new Runnable() { @Override public void run() {
            HttpURLConnection h = null;
            try {
                byte[] body = ShareCrypto.encrypt(ShareCrypto.unb64url(key), json).getBytes("UTF-8");
                h = (HttpURLConnection) new URL(relay + "/" + topic).openConnection();
                h.setRequestMethod("POST");
                h.setDoOutput(true);
                h.setConnectTimeout(10000);
                h.setReadTimeout(15000);
                h.setRequestProperty("User-Agent", AppInfo.userAgent());
                h.setRequestProperty("Content-Type", "text/plain");
                OutputStream os = h.getOutputStream();
                os.write(body);
                os.close();
                h.getResponseCode();
            } catch (Exception ignored) {
                // Jaringan putus sebentar: posisi berikutnya akan dikirim lagi.
            } finally { if (h != null) h.disconnect(); }
        }});
    }
}
