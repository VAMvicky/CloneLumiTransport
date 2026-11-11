package id.lumi.transport;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * "Bus makin dekat" juga saat layar mati / aplikasi di belakang (v2.16).
 *
 * Dulu peringatan ±10/±5/±2 menit hanya jalan selama detail perjalanan terbuka di layar (koneksi feed
 * ada di WebView). Layanan latar depan ini memegang koneksi MQTT-over-WebSocket sendiri (LiveSocket +
 * klien MQTT minimal di bawah), menghitung ETA bus ke halte naik (BusEta) dan memberi notifikasi.
 *
 * Dimulai dari: tombol "Beri tahu saat layar mati" di detail perjalanan, mulai pendampingan, atau tombol
 * "Pantau bus" di notifikasi pengingat berangkat. Berhenti sendiri setelah bus tiba, setelah 90 menit,
 * atau lewat tombol "Berhenti" di notifikasinya. Hanya rute yang dipantau yang dilanggan (hemat kuota).
 *
 * Masukan (JSON): {"code":"JAK108","title":"…","stop":{"name","lat","lon","id"},"next":{"name","lat","lon","id"}}
 */
public class BusWatchService extends Service {
    static final String CH_WATCH = "lumi_bus_watch", CH_ALERT = "lumi_bus";
    static final int NOTIF_ID = NotifIds.BUS_WATCH, ALERT_ID = NotifIds.BUS_ALERT;
    static final long MAX_MS = 90L * 60 * 1000, ARRIVED_LINGER_MS = 3L * 60 * 1000;
    static final String URL = "wss://mqtt.tj.co.id:8084/mqtt";
    static volatile boolean running;
    static volatile String watchingCode;

    private final Handler main = new Handler(Looper.getMainLooper());
    private LiveSocket sock;
    private String code, title;
    private final BusEta.Target target = new BusEta.Target();
    private final Map<String, Integer> levels = new HashMap<String, Integer>();
    private final Set<String> subscribed = new HashSet<String>();
    private long startedAt, retryMs = 2000, lastData;
    private boolean allTopic, gotData, connected, stopping;
    private double bestEta = -1; private String bestBus;
    private int pid = 1;

    public static boolean start(Context c, String json) {
        Intent i = new Intent(c, BusWatchService.class).putExtra("spec", json);
        try { c.startForegroundService(i); return true; } catch (Exception e) { return false; }
    }

    public static void stop(Context c) { c.stopService(new Intent(c, BusWatchService.class)); }

    static void channels(Context c) {
        Lang.ensure(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel a = new NotificationChannel(CH_WATCH, Lang.t("Pantau bus", "Bus watch"), NotificationManager.IMPORTANCE_LOW);
        a.setDescription(Lang.t("Lumi memantau bus yang kamu tunggu", "Lumi is watching the bus you're waiting for"));
        nm.createNotificationChannel(a);
        NotificationChannel b = new NotificationChannel(CH_ALERT, Lang.t("Info bus", "Bus info"), NotificationManager.IMPORTANCE_HIGH);
        b.setDescription(Lang.t("Bus yang kamu tunggu semakin dekat", "The bus you are waiting for is getting close"));
        nm.createNotificationChannel(b);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        Lang.load(this);
        channels(this);
        String spec = intent == null ? null : intent.getStringExtra("spec");
        boolean ok = false;
        try {
            JSONObject o = new JSONObject(spec);
            code = o.optString("code");
            title = o.optString("title", code);
            JSONObject s = o.optJSONObject("stop"), n = o.optJSONObject("next");
            if (s != null) { target.fromName = s.optString("name", null); target.fromLat = s.optDouble("lat"); target.fromLon = s.optDouble("lon"); target.fromId = emptyNull(s.optString("id")); }
            if (n != null) { target.toName = n.optString("name", null); target.toLat = n.optDouble("lat"); target.toLon = n.optDouble("lon"); target.toId = emptyNull(n.optString("id")); }
            ok = !code.isEmpty() && target.fromName != null;
        } catch (Exception ignored) { }
        Notification note = ongoing(Lang.t("Menghubungkan ke data armada…", "Connecting to the fleet feed…"));
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIF_ID, note);
        if (!ok) { stopSelf(); return START_NOT_STICKY; }
        // Pantauan baru menggantikan yang lama.
        closeSock();
        levels.clear(); subscribed.clear(); allTopic = false; bestEta = -1; bestBus = null;
        running = true; watchingCode = code;
        startedAt = System.currentTimeMillis();
        stopping = false;
        main.removeCallbacksAndMessages(null);       // termasuk "berhenti setelah tiba" dari pantauan sebelumnya
        retryMs = 2000;
        connect();
        main.postDelayed(tick, 30000);
        return START_NOT_STICKY;
    }

    static String emptyNull(String s) { return s == null || s.isEmpty() ? null : s; }

    // ------------------------------------------------------------------ notifikasi
    private PendingIntent stopPi() {
        return PendingIntent.getService(this, 41, new Intent(this, BusWatchService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private PendingIntent openPi() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 42, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    private Notification ongoing(String text) {
        Notification.Builder b = new Notification.Builder(this, CH_WATCH)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(Lang.t("Memantau ", "Watching ") + (code == null ? "bus" : code) + (target.fromName != null ? Lang.t(" ke ", " to ") + target.fromName : ""))
                .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false).setColor(0xFF1565D8)
                .setContentIntent(openPi())
                .addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), Lang.t("Berhenti", "Stop"), stopPi()).build());
        return b.build();
    }

    private void updateOngoing(String text) {
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, ongoing(text)); } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private void alert(String t, String text) {
        Notification.Builder b = new Notification.Builder(this, CH_ALERT)
                .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(t).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true)
                .setColor(0xFF1565D8).setContentIntent(openPi());
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ALERT_ID, b.build()); } catch (Exception ignored) { }
    }

    private final Runnable tick = new Runnable() { @Override public void run() {
        long now = System.currentTimeMillis();
        if (now - startedAt > MAX_MS) { stopSelf(); return; }
        if (connected && lastData > 0 && now - lastData > 120000) updateOngoing(Lang.t("Belum ada bus " + code + " yang terpantau menuju halte ini.", "No " + code + " bus heading to this stop spotted yet."));
        main.postDelayed(this, 30000);
    }};

    // ------------------------------------------------------------------ MQTT minimal (sama dengan live.js)
    static byte[] str(String s) {
        byte[] b = s.getBytes(StandardCharsets.UTF_8);
        byte[] o = new byte[b.length + 2];
        o[0] = (byte) (b.length >> 8); o[1] = (byte) b.length;
        System.arraycopy(b, 0, o, 2, b.length);
        return o;
    }
    static byte[] packet(int type, byte[] body) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(type);
        int n = body.length;
        do { int d = n % 128; n /= 128; if (n > 0) d |= 128; o.write(d); } while (n > 0);
        o.write(body, 0, body.length);
        return o.toByteArray();
    }
    static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (byte[] p : parts) o.write(p, 0, p.length);
        return o.toByteArray();
    }
    /** Topik satu kode rute; Mikrotrans bisa "JAK36" atau "JAK.36" di feed. */
    static String[] topicsFor(String c) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^JAK\\.?(\\d+\\w*)$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(c);
        if (m.find()) return new String[]{"/mobile_armada/+/JAK" + m.group(1) + "/#", "/mobile_armada/+/JAK." + m.group(1) + "/#"};
        return new String[]{"/mobile_armada/+/" + c + "/#"};
    }

    private void connect() {
        if (stopping) return;
        gotData = false; connected = false;
        final LiveSocket s = new LiveSocket(URL, new LiveSocket.Listener() {
            public void onOpen() {
                // Broker hanya menerima koneksi anonim dengan client ID berawalan "mqttjs_" (lihat live.js).
                String cid = "mqttjs_" + Long.toHexString(Double.doubleToLongBits(Math.random())).substring(0, 8);
                send(packet(0x10, concat(str("MQTT"), new byte[]{4, 0x02, 0, 60}, str(cid))));
                main.removeCallbacks(ping);
                main.postDelayed(ping, 45000);
            }
            public void onData(byte[] d) { onPackets(d); }
            public void onClose(String reason) { main.post(new Runnable() { @Override public void run() { onClosed(); } }); }
        });
        java.util.Set<String> f = new java.util.HashSet<String>();
        f.add(LiveSocket.norm(code));
        s.filter = f;                         // pesan rute lain dibuang sebelum diproses
        sock = s;
        s.start();
    }
    private final Runnable ping = new Runnable() { @Override public void run() {
        send(new byte[]{(byte) 0xC0, 0});
        main.postDelayed(this, 45000);
    }};
    private void send(byte[] b) { LiveSocket s = sock; if (s != null) s.send(b); }

    private void subscribe() {
        String[] ts = allTopic ? new String[]{"/mobile_armada/#"} : topicsFor(code);
        for (String t : ts) {
            if (subscribed.contains(t)) continue;
            int id = (pid++ & 0xffff); if (id == 0) id = 1;
            send(packet(0x82, concat(new byte[]{(byte) (id >> 8), (byte) id}, str(t), new byte[]{0})));
            subscribed.add(t);
        }
    }

    private void onClosed() {
        main.removeCallbacks(ping);
        boolean wasSub = connected && !gotData && !allTopic;
        connected = false; subscribed.clear(); sock = null;
        if (stopping) return;
        // Server memutus setelah langganan per rute tanpa data → topik umum (hanya untuk sesi pantau ini).
        if (wasSub) { allTopic = true; retryMs = 500; }
        updateOngoing(Lang.t("Menyambung ulang ke data armada…", "Reconnecting to the fleet feed…"));
        main.postDelayed(new Runnable() { @Override public void run() { connect(); } }, retryMs);
        retryMs = Math.min(30000, (long) (retryMs * 1.7));
    }

    /** Dipanggil di thread jaringan LiveSocket: urai paket MQTT utuh. */
    private void onPackets(byte[] b) {
        int pos = 0;
        while (b.length - pos >= 2) {
            int mult = 1, len = 0, i = pos + 1, d;
            do { if (i >= b.length) return; d = b[i++] & 0xFF; len += (d & 127) * mult; mult *= 128; } while ((d & 128) != 0);
            if (i + len > b.length) return;
            int type = (b[pos] & 0xFF) >> 4, flags = b[pos] & 15;
            if (type == 2 && len >= 2) {                                   // CONNACK
                if (b[i + 1] == 0) { connected = true; retryMs = 2000; main.post(new Runnable() { @Override public void run() { subscribe(); } }); }
            } else if (type == 3 && len >= 2) {                            // PUBLISH
                int tl = ((b[i] & 0xFF) << 8) | (b[i + 1] & 0xFF), p = i + 2 + tl;
                if ((flags >> 1 & 3) > 0 && p + 2 <= i + len) { send(new byte[]{0x40, 2, b[p], b[p + 1]}); p += 2; }
                if (p <= i + len) {
                    final String body = new String(b, p, i + len - p, StandardCharsets.UTF_8);
                    main.post(new Runnable() { @Override public void run() { onMessage(body); } });
                }
            }
            pos = i + len;
        }
    }

    private void onMessage(String body) {
        JSONObject msg;
        try { msg = new JSONObject(body); } catch (Exception e) { return; }
        gotData = true; lastData = System.currentTimeMillis();
        if (!LiveSocket.norm(msg.optString("route_code", code)).equals(LiveSocket.norm(code))) return;
        String bus = msg.optString("bus_body_no", "?");
        double m = BusEta.minutes(msg, target);
        if (m < 0) { if (bus.equals(bestBus)) { bestBus = null; bestEta = -1; } return; }
        if (bestBus == null || bus.equals(bestBus) || m < bestEta) { bestBus = bus; bestEta = m; }
        updateOngoing(bestEta <= 0 ? Lang.t("Bus " + code + " tiba di " + target.fromName + " (" + bestBus + ")", "Bus " + code + " arriving at " + target.fromName + " (" + bestBus + ")")
                : Lang.t("Berikutnya ±" + Math.round(bestEta) + " mnt (" + bestBus + ")", "Next in ±" + Math.round(bestEta) + " min (" + bestBus + ")"));
        int lvl = BusEta.level(m);
        Integer prev = levels.get(bus);
        if (prev == null) {
            if (levels.size() > 40) levels.clear();
            levels.put(bus, lvl);
            if (lvl < 3) return;                       // bus baru terlihat: hanya beri tahu bila sudah dekat sekali
        } else {
            if (lvl <= prev) return;
            levels.put(bus, lvl);
        }
        if (lvl == 0) return;
        String when = lvl >= 4 ? Lang.t("sudah tiba", "has arrived") : lvl == 3 ? Lang.t("±2 menit lagi", "is ±2 min away")
                : lvl == 2 ? Lang.t("±5 menit lagi", "is ±5 min away") : Lang.t("±10 menit lagi", "is ±10 min away");
        alert("Bus " + code + (lvl >= 4 ? Lang.t(" tiba", " arriving") : Lang.t(" mendekat", " approaching")),
                "Bus " + code + " " + when + Lang.t(" di ", " at ") + target.fromName + " (" + bus + ")");
        if (lvl >= 4 && !stopping) {
            stopping = true;                           // tetap tampil sebentar, lalu selesai
            main.postDelayed(new Runnable() { @Override public void run() { stopSelf(); } }, ARRIVED_LINGER_MS);
        }
    }

    private void closeSock() {
        LiveSocket s = sock; sock = null;
        if (s != null) { try { s.send(new byte[]{(byte) 0xE0, 0}); } catch (Exception ignored) { } s.close(); }
    }

    @Override
    public void onDestroy() {
        stopping = true; running = false; watchingCode = null;
        main.removeCallbacksAndMessages(null);
        closeSock();
        try { stopForeground(true); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Override
    public void onTimeout(int startId) { stopSelf(); }   // Android 15: batas waktu layanan dataSync

    @Override public IBinder onBind(Intent i) { return null; }
}
