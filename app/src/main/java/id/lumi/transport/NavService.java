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

/**
 * Mode pendampingan: layanan latar depan yang membaca GPS terus-menerus (juga saat layar mati /
 * aplikasi di belakang), menghitung posisi pada rute (GuideTracker), memperbarui notifikasi
 * "tinggal N pemberhentian", dan membunyikan peringatan "siap-siap turun" / "turun sekarang".
 */
public class NavService extends Service {
    public static final String CH_GUIDE = "lumi_guide";
    public static final String CH_ALERT = "lumi_guide_alert";
    static final int NOTIF_ID = 7001, ALERT_ID = 7002;

    public interface Listener { void onGuide(String stateJson); }
    static Listener listener;
    static GuideTracker tracker;
    static String lastJson;
    static boolean running;

    private LocationManager lm;
    private LocationListener ll;

    public static void start(Context ctx, String spec, String title) {
        tracker = new GuideTracker(spec);
        lastJson = null;
        Intent i = new Intent(ctx, NavService.class);
        i.putExtra("title", title);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, NavService.class));
        tracker = null;
        lastJson = null;
    }

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel a = new NotificationChannel(CH_GUIDE, "Pendampingan perjalanan", NotificationManager.IMPORTANCE_LOW);
        a.setDescription("Posisi dan sisa pemberhentian selama perjalanan");
        nm.createNotificationChannel(a);
        NotificationChannel b = new NotificationChannel(CH_ALERT, "Peringatan turun", NotificationManager.IMPORTANCE_HIGH);
        b.setDescription("Siap-siap turun / turun sekarang");
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

    @SuppressWarnings("deprecation")
    private Notification build(String title, String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_GUIDE) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setColor(0xFF1565D8)
                .setContentIntent(openApp())
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "Berhenti", stopIntent()).build());
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private void alert(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ALERT) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle("Lumi · Pendampingan").setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true).setColor(0xFF1565D8).setContentIntent(openApp())
                .setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(ALERT_ID, b.build());
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 400, 200, 400, 200, 600}, -1));
                else v.vibrate(new long[]{0, 400, 200, 400, 200, 600}, -1);
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
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "Pendampingan perjalanan";
        Notification n = build(title, "Mencari posisi GPS…");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIF_ID, n);
        running = true;
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
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, build("Izin lokasi diperlukan", "Buka Lumi dan izinkan akses lokasi."));
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
        GuideTracker.State s = t.update(loc.getLatitude(), loc.getLongitude(), loc.hasAccuracy() ? loc.getAccuracy() : 30);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF_ID, build(s.title, s.text));
        if (s.alert != null) alert(s.alert);
        String json = GuideTracker.toJson(s);
        lastJson = json;
        if (listener != null) listener.onGuide(json);
        if (s.done) {
            // Biarkan notifikasi "sampai" tampil sebentar lalu berhenti.
            new android.os.Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override public void run() { if (tracker != null && tracker.last() != null && tracker.last().done) { tracker = null; stopSelf(); } }
            }, 60000);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
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
