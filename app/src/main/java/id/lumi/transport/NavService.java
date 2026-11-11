package id.lumi.transport;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.pm.PackageManager;
import android.Manifest;

/**
 * Mode pendampingan: layanan latar depan yang membaca GPS terus-menerus (juga saat layar mati /
 * aplikasi di belakang), menghitung posisi pada rute (GuideTracker), memperbarui notifikasi
 * "tinggal N pemberhentian", dan membunyikan peringatan "siap-siap turun" / "turun sekarang".
 */
public class NavService extends Service {
    public static final String CH_GUIDE = "lumi_guide";
    public static final String CH_ALERT = "lumi_guide_alert";
    static final int NOTIF_ID = NotifIds.GUIDE, ALERT_ID = NotifIds.GUIDE_ALERT;

    public interface Listener { void onGuide(String stateJson); }
    static Listener listener;
    static GuideTracker tracker;
    static String lastJson;
    static boolean running;

    private LocationManager lm;
    private LocationListener ll;

    /** Izin lokasi sudah diberikan? Layanan latar depan tipe location wajib memilikinya (Android 14+). */
    static boolean hasLocation(Context ctx) {
        return ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Mulai pendampingan. v2.17 (B-04): tanpa izin lokasi, layanan tidak dimulai (dulu startForeground
     * melempar SecurityException di Android 14+ dan aplikasi tertutup). Mengembalikan false bila gagal.
     */
    public static boolean start(Context ctx, String spec, String title) {
        if (!hasLocation(ctx)) return false;
        tracker = new GuideTracker(spec);
        lastJson = null;
        Intent i = new Intent(ctx, NavService.class);
        i.putExtra("title", title);
        try { ctx.startForegroundService(i); return true; }
        catch (Exception e) { tracker = null; return false; }
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, NavService.class));
        tracker = null;
        lastJson = null;
    }

    static void channels(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        Lang.ensure(ctx);
        NotificationChannel a = new NotificationChannel(CH_GUIDE, Lang.t("Pendampingan perjalanan", "Trip guidance"), NotificationManager.IMPORTANCE_LOW);
        a.setDescription(Lang.t("Posisi dan sisa pemberhentian selama perjalanan", "Your position and remaining stops during the trip"));
        nm.createNotificationChannel(a);
        NotificationChannel b = new NotificationChannel(CH_ALERT, Lang.t("Peringatan turun", "Get-off alerts"), NotificationManager.IMPORTANCE_HIGH);
        b.setDescription(Lang.t("Siap-siap turun / turun sekarang", "Get ready / get off now"));
        b.enableVibration(true);
        b.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 600});
        nm.createNotificationChannel(b);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("openGuide", true);
        return PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent stopIntent() {
        Intent i = new Intent(this, NavService.class);
        i.setAction("stop");
        return PendingIntent.getService(this, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification build(String title, String text) { return build(title, text, null); }

    @SuppressWarnings("deprecation")
    private Notification build(String title, String text, GuideTracker.State st) {
        Notification.Builder b = new Notification.Builder(this, CH_GUIDE);
        b.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setColor(0xFF1565D8)
                .setCategory(Notification.CATEGORY_NAVIGATION)
                .setContentIntent(openApp())
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Lang.t("Berhenti", "Stop"), stopIntent()).build());
        GuideTracker t = tracker;
        if (t != null && t.size() > 1) {
            // v2.17: notifikasi progres langsung. Semua versi: batang progres biasa.
            // Android 16+: ProgressStyle bersegmen per ruas + "Live Update" di layar kunci / status bar.
            b.setProgress(t.size(), t.progress(), false);
            if (Build.VERSION.SDK_INT >= 36) LiveProgress.apply(b, t, st, title);
        }
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private void alert(String text) {
        Notification.Builder b = new Notification.Builder(this, CH_ALERT);
        b.setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle(Lang.t("Lumi · Pendampingan", "Lumi · Guidance")).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true).setColor(0xFF1565D8).setContentIntent(openApp())
                .setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ALERT_ID, b.build());
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null) {
                v.vibrate(VibrationEffect.createWaveform(new long[]{0, 400, 200, 400, 200, 600}, -1));
            }
        } catch (Exception ignored) { }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            if (listener != null) listener.onGuide("{\"stopped\":true}");
            tracker = null; lastJson = null;
            stopSelf();
            return START_NOT_STICKY;
        }
        channels(this);
        Lang.load(this);
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : Lang.t("Pendampingan perjalanan", "Trip guidance");
        Notification n = build(title, Lang.t("Mencari posisi GPS…", "Finding GPS position…"));
        try {
            if (!hasLocation(this)) throw new SecurityException("location permission");
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            // B-04: izin lokasi dicabut / sistem menolak layanan latar depan → berhenti dengan pesan, bukan crash.
            tracker = null; lastJson = null;
            if (listener != null) listener.onGuide("{\"stopped\":true,\"error\":\"permission\"}");
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        spokenPhase = null; spokenStops = -1;
        startLocation();
        return START_NOT_STICKY;
    }

    @SuppressWarnings("MissingPermission")
    private void startLocation() {
        if (lm != null) return;
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        ll = new LocationListener() {
            @Override public void onLocationChanged(Location loc) { onLoc(loc); }
            @Override public void onStatusChanged(String p, int s, Bundle b) { }
            @Override public void onProviderEnabled(String p) { }
            @Override public void onProviderDisabled(String p) { }
        };
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER))
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, ll, Looper.getMainLooper());   // tiap detik → gerakan peta halus
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000, 10, ll, Looper.getMainLooper());
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 120000) onLoc(best);
        } catch (SecurityException e) {
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, build(Lang.t("Izin lokasi diperlukan", "Location permission needed"), Lang.t("Buka Lumi dan izinkan akses lokasi.", "Open Lumi and allow location access.")));
        }
    }

    private long lastNetAt;
    private void onLoc(Location loc) {
        GuideTracker t = tracker;
        if (t == null) return;
        // Abaikan lokasi jaringan yang kasar bila GPS baru saja memberi posisi.
        if (LocationManager.NETWORK_PROVIDER.equals(loc.getProvider())) {
            if (System.currentTimeMillis() - lastNetAt < 15000) return;
        } else lastNetAt = System.currentTimeMillis();
        if (finishing) return;                      // B-08: sudah sampai, tunggu berhenti
        GuideTracker.State s = t.update(loc.getLatitude(), loc.getLongitude(), loc.hasAccuracy() ? loc.getAccuracy() : 30);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, build(s.title, s.text, s));
        if (s.alert != null) alert(s.alert);
        voice(s);
        String json = GuideTracker.toJson(s);
        lastJson = json;
        if (listener != null) listener.onGuide(json);
        if (s.done) {
            // Biarkan notifikasi "sampai" tampil sebentar lalu berhenti. v2.17 (B-08): cukup SATU penunda,
            // dan GPS dimatikan (dulu tiap posisi baru menambah penunda 60 detik dan notifikasi terus diperbarui).
            finishing = true;
            if (lm != null && ll != null) try { lm.removeUpdates(ll); } catch (Exception ignored) { }
            handler.postDelayed(new Runnable() {
                @Override public void run() { if (tracker != null && tracker.last() != null && tracker.last().done) { tracker = null; stopSelf(); } }
            }, 60000);
        }
    }

    private final android.os.Handler handler = new android.os.Handler(Looper.getMainLooper());
    private boolean finishing;
    private String spokenPhase;
    private int spokenStops = -1;

    /**
     * v2.17: panduan suara dari layanan (tetap jalan saat layar mati / aplikasi di belakang). Diucapkan:
     * setiap peringatan, perubahan fase (jalan → tunggu → naik → pindah), dan sisa 3/2 pemberhentian.
     */
    private void voice(GuideTracker.State s) {
        if (!voiceOn(this)) return;
        String say = null;
        if (s.alert != null) say = s.alert;
        else if (!s.phase.equals(spokenPhase)) say = s.title + ". " + s.text;
        else if ("ride".equals(s.phase) && s.stopsLeft != spokenStops && s.stopsLeft >= 2 && s.stopsLeft <= 3) say = s.title;
        spokenPhase = s.phase;
        if ("ride".equals(s.phase) || "wait".equals(s.phase)) spokenStops = s.stopsLeft;
        if (say != null) LumiTts.speak(this, say);
    }

    static boolean voiceOn(Context c) { return c.getSharedPreferences("lumi", MODE_PRIVATE).getBoolean("voice", false); }

    static void setVoice(Context c, boolean on) {
        c.getSharedPreferences("lumi", MODE_PRIVATE).edit().putBoolean("voice", on).apply();
        if (!on) LumiTts.stop();
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        if (lm != null && ll != null) try { lm.removeUpdates(ll); } catch (Exception ignored) { }
        lm = null;
        // Pastikan notifikasi pendampingan hilang saat layanan berhenti.
        try { stopForeground(true); } catch (Exception ignored) { }
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(NOTIF_ID); } catch (Exception ignored) { }
        super.onDestroy();
    }

    /** Aplikasi ditutup dari daftar aplikasi terbaru → pendampingan ikut berhenti. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        tracker = null; lastJson = null;
        stopForeground(true);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
