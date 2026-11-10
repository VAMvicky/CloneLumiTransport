package id.lumi.transport;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lumi Transport â€” kerangka native.
 * UI dan mesin rute berjalan di WebView (assets/www). Kelas ini menyediakan jembatan
 * "LumiNative" untuk: HTTP (geocoding/rute jalan, dengan User-Agent yang jelas),
 * lokasi GPS, membuka aplikasi ojol, dan berbagi teks.
 */
public class MainActivity extends Activity {
    private static final int REQ_LOCATION = 41, REQ_GUIDE = 42, REQ_NOTIF = 43, REQ_PERM = 44;
    /** User-Agent tunggal untuk semua permintaan; diisi dari versionName di onCreate. */
    private static String UA = "LumiTransport/2.0 (Android)";
    /** Pintasan dari app shortcut / Quick Settings, dikirim ke JS setelah halaman siap. */
    private String pendingShortcut;
    private volatile int insetsTop, insetsBottom;
    private volatile boolean imeOpen;

    private WebView web;
    private android.widget.FrameLayout root;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private String pendingLocateId;
    private String pendingShare;
    private boolean pageReady;
    private String[] pendingGuide;
    private final Object liveLock = new Object();
    private LiveSocket live;
    private volatile java.util.Set<String> liveFilterSet;
    private final java.util.ArrayList<String> liveQueue = new java.util.ArrayList<String>();
    private boolean liveFlushPending;

    /** Kirim data bus ke JS paling sering tiap 250 ms (digabung) agar WebView tidak kewalahan. */
    private void scheduleLiveFlush() {
        synchronized (liveLock) { if (liveFlushPending) return; liveFlushPending = true; }
        main.postDelayed(new Runnable() { @Override public void run() {
            StringBuilder sb = new StringBuilder("[");
            synchronized (liveLock) {
                for (int i = 0; i < liveQueue.size(); i++) { if (i > 0) sb.append(','); sb.append('"').append(liveQueue.get(i)).append('"'); }
                liveQueue.clear();
                liveFlushPending = false;
            }
            sb.append(']');
            if (web != null) web.evaluateJavascript("window.LumiLive && LumiLive.__nativeData(" + sb + ")", null);
        }}, 250);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CrashLog.install(this);
        Lang.load(this);
        pendingShortcut = getIntent() == null ? null : getIntent().getStringExtra("lumi_shortcut");
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            // v2.13: header halaman digambar sampai ke balik status bar (menyatu, tanpa pita warna
            // terpisah). Inset dikirim ke halaman lewat listener di bawah, sama seperti Android 15.
            w.setDecorFitsSystemWindows(false);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
            w.setNavigationBarContrastEnforced(false);
            // v2.13.1: Window.getInsetsController() membaca mDecor langsung; sebelum decor dibuat
            // nilainya null → crash saat aplikasi dibuka (Android 11–14). Buat decor dulu lewat
            // getDecorView(), lalu minta controller dari view-nya, dan jangan biarkan gagal di sini.
            try {
                android.view.WindowInsetsController c = w.getDecorView().getWindowInsetsController();
                if (c != null) c.setSystemBarsAppearance(android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            } catch (Exception ignored) { }
        } else {
            w.setStatusBarColor(Color.parseColor("#4DB6F4"));
            w.setNavigationBarColor(Color.parseColor("#FFFFFF"));
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#EEF6FC"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // Identitas aplikasi untuk server peta: satu UA, diambil dari versionName.
        try {
            String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            if (v != null && !v.isEmpty()) UA = "LumiTransport/" + v + " (Android)";
        } catch (Exception ignored) { }
        s.setUserAgentString(s.getUserAgentString() + " " + UA);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(), "LumiNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                sendInsets();
                if (pendingShortcut != null) {
                    js("window.__lumiShortcut && __lumiShortcut(" + JSONObject.quote(pendingShortcut) + ")");
                    pendingShortcut = null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("file:///android_asset/")) return false;
                openExternal(url);
                return true;
            }

            /**
             * Petak peta Google dimuat lewat <img>, dan <img> tidak bisa memasang header sendiri.
             * Jadi permintaan ke host Google Maps diambil alih di sini: kita GET sendiri dengan
             * header penyamaran (GoogleKeys), lalu alirannya dikembalikan ke WebView.
             * Gagal di tengah jalan → null, WebView memakai jalur normalnya.
             */
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                try {
                    Uri u = req.getUrl();
                    if (u == null || !GoogleKeys.isGoogleApiHost(u.getHost())) return null;
                    if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
                    return googleFetch(u.toString());
                } catch (Exception ignored) {
                    return null;
                }
            }
        });
        root = new android.widget.FrameLayout(this);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        // Android 15 (targetSdk 35) memaksa edge-to-edge. Inset dikirim ke halaman sebagai
        // variabel CSS (--safe-top/--safe-bottom), bukan padding native, supaya latar header
        // tetap menyambung sampai ke atas layar.
        //
        // v2.12:
        //  - Nilai inset dari Android dalam piksel fisik; CSS memakai dp. Dulu nilai mentah dikirim,
        //    sehingga header/nav jadi sangat tinggi begitu inset dikirim ulang (mis. saat keyboard muncul).
        //  - Kiriman pertama terjadi sebelum halaman selesai dimuat, jadi tidak sampai dan header
        //    menabrak status bar. Sekarang dikirim lagi di onPageFinished dan bisa diminta lewat bridge.
        //  - Edge-to-edge membuat adjustResize tidak berlaku: tinggi keyboard dipasang sebagai padding
        //    bawah root agar WebView mengecil, dan nav bawah halaman tidak terdorong/tertutup.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    boolean kb = insets.isVisible(WindowInsets.Type.ime()) && ime.bottom > b.bottom;
                    float d = getResources().getDisplayMetrics().density;
                    insetsTop = Math.round(b.top / d);
                    insetsBottom = kb ? 0 : Math.round(b.bottom / d);   // keyboard menutupi navigation bar
                    imeOpen = kb;
                    v.setPadding(b.left, 0, b.right, kb ? ime.bottom : 0);
                    sendInsets();
                    return WindowInsets.CONSUMED;
                }
            });
            root.requestApplyInsets();
        }
        pendingShare = sharedText(getIntent());
        pendingOpen = openTarget(getIntent());
        web.loadUrl("file:///android_asset/www/index.html");
        NavService.listener = new NavService.Listener() {
            @Override public void onGuide(String json) { js("window.__lumiGuide && __lumiGuide(" + json + ")"); }
        };
        try { RouteUpdater.schedule(this); } catch (Exception ignored) { }
        try { RouteWatchJob.schedule(this); } catch (Exception ignored) { }
    }

    private String pendingOpen;
    private static String openTarget(Intent i) {
        if (i == null) return null;
        if (i.getBooleanExtra("openGuide", false)) return "guide";
        if (i.getBooleanExtra("openChanges", false)) return "changes";
        return null;
    }

    /** Android 13+: izin notifikasi (untuk pendampingan & info perubahan rute), diminta sekali. */
    private void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) return;
        android.content.SharedPreferences sp = getSharedPreferences("lumi", MODE_PRIVATE);
        if (sp.getBoolean("askedNotif", false)) return;
        sp.edit().putBoolean("askedNotif", true).apply();
        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
    }

    /** Teks yang dibagikan dari aplikasi lain (mis. Google Maps: "Nama tempat\nhttps://maps.app.goo.gl/â€¦"). */
    private static String sharedText(Intent i) {
        if (i == null || !Intent.ACTION_SEND.equals(i.getAction())) return null;
        CharSequence subj = i.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        CharSequence t = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (t == null) return null;
        String s = t.toString();
        if (subj != null && !s.contains(subj)) s = subj + "\n" + s;
        return s;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String sc = intent == null ? null : intent.getStringExtra("lumi_shortcut");
        if (sc != null) {
            if (pageReady) js("window.__lumiShortcut && __lumiShortcut(" + JSONObject.quote(sc) + ")");
            else pendingShortcut = sc;
        }
        String o = openTarget(intent);
        if (o != null) {
            if (pageReady) js("window.lumiOpen && lumiOpen(" + JSONObject.quote(o) + ")");
            else pendingOpen = o;
        }
        String s = sharedText(intent);
        if (s == null) return;
        if (pageReady) js("window.lumiShared && window.lumiShared(" + JSONObject.quote(s) + ")");
        else pendingShare = s;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (watchWanted && watchL == null) watchStart();
        if (pageReady) js("window.__lumiPerm && __lumiPerm(); window.__lumiResume && __lumiResume()");   // kembali dari pengaturan HP
        updatePip(NavService.tracker != null);
        if (NavService.tracker != null) compassOn(true);
        if (!isInPictureInPictureMode()) wasPip = false;   // kembali layar penuh
    }

    /* ---- mode PiP (jendela kecil) selama pendampingan ---- */
    private boolean pipSupported() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }
    private android.app.PictureInPictureParams pipParams(boolean auto) {
        android.app.PictureInPictureParams.Builder b = new android.app.PictureInPictureParams.Builder()
                .setAspectRatio(new android.util.Rational(4, 5));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(auto).setSeamlessResizeEnabled(true);
        return b.build();
    }
    /** Android 12+: masuk PiP otomatis saat aplikasi ditinggalkan selama pendampingan. */
    void updatePip(boolean guiding) {
        if (!pipSupported()) return;
        try { setPictureInPictureParams(pipParams(guiding)); } catch (Exception ignored) { }
    }
    void enterPip() {
        if (!pipSupported()) return;
        try { enterPictureInPictureMode(pipParams(NavService.tracker != null)); } catch (Exception ignored) { }
    }
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Android 8â€“11: tombol Home saat pendampingan â†’ jendela kecil.
        if (Build.VERSION.SDK_INT < 31 && NavService.tracker != null) enterPip();
    }
    private long pipExitAt, stoppedAt;
    private boolean stopped, wasPip;
    @Override
    protected void onStart() { super.onStart(); stopped = false; }
    /*
     * Jendela PiP ditutup (tombol Ã— / diusap) = aplikasi ditutup: pendampingan berhenti dan tugas dihapus.
     * Urutan callback berbeda antar-HP: kadang "keluar PiP" datang dulu lalu onStop, kadang onStop dulu.
     * Keduanya ditangani. Membesarkan PiP ke layar penuh tidak memicu onStop, jadi tidak ikut tertutup;
     * layar mati saat PiP juga tidak (masih dalam mode PiP).
     */
    @Override
    public void onPictureInPictureModeChanged(boolean inPip, android.content.res.Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        if (inPip) { wasPip = true; }
        else {
            pipExitAt = System.currentTimeMillis();
            if (stopped && wasPip) { closeFromPip(); return; }
        }
        js("window.__lumiPip && __lumiPip(" + inPip + ")");
    }
    private boolean closing;
    private void closeFromPip() {
        if (closing) return;
        closing = true;
        NavService.stop(this);
        compassOn(false);
        android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        try { if (nm != null) nm.cancel(NavService.NOTIF_ID); } catch (Exception ignored) { }
        finishAndRemoveTask();
    }
    @Override
    protected void onStop() {
        super.onStop();
        stopped = true; stoppedAt = System.currentTimeMillis();
        if (watchL != null) watchStop();   // watchWanted tetap: dilanjutkan di onResume
        if (!isChangingConfigurations() && wasPip && !isInPictureInPictureMode()
                && System.currentTimeMillis() - pipExitAt < 3000) {
            closeFromPip();
            return;
        }
        // Tidak terlihat (bukan PiP): kompas dimatikan agar hemat baterai.
        if (!isInPictureInPictureMode()) compassOn(false);
    }

    /* ---- kompas: arah hadap HP untuk "senter" di titik posisiku ---- */
    private android.hardware.SensorManager sm;
    private android.hardware.SensorEventListener compassL;
    private float lastHeading = -999; private long lastHeadingAt;
    void compassOn(boolean on) {
        if (sm == null) sm = (android.hardware.SensorManager) getSystemService(SENSOR_SERVICE);
        if (sm == null) return;
        if (!on) { if (compassL != null) sm.unregisterListener(compassL); compassL = null; return; }
        if (compassL != null) return;
        android.hardware.Sensor rv = sm.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR);
        if (rv == null) return;
        final float[] R = new float[9], o = new float[3];
        compassL = new android.hardware.SensorEventListener() {
            @Override public void onSensorChanged(android.hardware.SensorEvent e) {
                android.hardware.SensorManager.getRotationMatrixFromVector(R, e.values);
                android.hardware.SensorManager.getOrientation(R, o);
                float deg = (float) ((Math.toDegrees(o[0]) + 360) % 360);
                long now = System.currentTimeMillis();
                float d = Math.abs(((deg - lastHeading + 540) % 360) - 180);
                if (d < 3 || now - lastHeadingAt < 120) return;
                lastHeading = deg; lastHeadingAt = now;
                js("window.__lumiHeading && __lumiHeading(" + Math.round(deg) + ")");
            }
            @Override public void onAccuracyChanged(android.hardware.Sensor s, int a) { }
        };
        sm.registerListener(compassL, rv, android.hardware.SensorManager.SENSOR_DELAY_UI);
    }

    private boolean hasLoc() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    private boolean hasNotif() {
        if (Build.VERSION.SDK_INT >= 33) return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }
    private boolean hasBattery() {
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }
    static boolean isChineseOem() {
        String m = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(java.util.Locale.US);
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") || m.contains("oppo") || m.contains("vivo")
                || m.contains("realme") || m.contains("infinix") || m.contains("tecno") || m.contains("itel") || m.contains("oneplus") || m.contains("iqoo");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.lumiBack && window.lumiBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (!"\"1\"".equals(value)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onDestroy() {
        NavService.listener = null;
        watchStop();
        compassOn(false);
        synchronized (liveLock) { if (live != null) { live.close(); live = null; } liveQueue.clear(); }
        // Aplikasi ditutup (bukan sekadar diputar/dibuat ulang) â†’ pendampingan ikut berhenti.
        if (isFinishing() || wasPip) NavService.stop(this);
        pool.shutdownNow();
        LumiTts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Kirim tinggi system bar ke halaman (dipakai CSS sebagai --safe-top/--safe-bottom). */
    private void sendInsets() {
        js("window.__lumiInsets && window.__lumiInsets(" + insetsTop + "," + insetsBottom + "," + imeOpen + ")");
    }

    private void js(final String code) {
        main.post(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(code, null); }});
    }

    private void openExternal(String url) {
        try {
            Intent i;
            if (url.startsWith("intent:")) i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            else i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            js("window.lumiToast && lumiToast(" + JSONObject.quote(Lang.t("Tidak ada aplikasi untuk membuka tautan ini", "No app can open this link")) + ")");
        }
    }

    // ------------------------------------------------------------ lokasi
    private void deliverLocation(String id, Location loc, String err) {
        try {
            JSONObject o = new JSONObject();
            if (loc != null) {
                o.put("lat", loc.getLatitude());
                o.put("lon", loc.getLongitude());
                o.put("acc", loc.getAccuracy());
            } else {
                o.put("error", err == null ? Lang.t("Lokasi tidak tersedia", "Location unavailable") : err);
            }
            js("window.__lumiLocate(" + JSONObject.quote(id) + "," + o.toString() + ")");
        } catch (Exception ignored) { }
    }

    /*
     * v2.13.3 (B1): posisi yang dipakai harus segar dan dari GPS bila ada.
     *  - Cache hanya dipakai bila umurnya < 20 detik DAN akurasinya <= 60 m (dulu: 3 menit, akurasi apa pun).
     *  - GPS dan jaringan diminta bersamaan. Fix GPS langsung dipakai; fix jaringan hanya dipakai bila
     *    GPS belum menjawab dalam 4 detik (di dalam gedung), atau sebagai cadangan saat batas 15 detik habis.
     */
    @SuppressWarnings("MissingPermission")
    private void locateNow(final String id) {
        final LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) { deliverLocation(id, null, Lang.t("Layanan lokasi tidak tersedia", "Location service unavailable")); return; }
        Location best = null;
        for (String p : lm.getProviders(true)) {
            Location l = lm.getLastKnownLocation(p);
            if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
        }
        if (best != null && System.currentTimeMillis() - best.getTime() < 20 * 1000 && best.hasAccuracy() && best.getAccuracy() <= 60) {
            deliverLocation(id, best, null);
            return;
        }
        final boolean gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        final boolean net = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        final Location fallback = best;
        if (!gps && !net) {
            deliverLocation(id, fallback, Lang.t("Aktifkan GPS / Lokasi di pengaturan ponsel", "Turn on GPS / Location in your phone settings"));
            return;
        }
        final boolean[] done = {false};
        final Location[] netFix = {null};
        final LocationListener[] holder = new LocationListener[1];
        holder[0] = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                if (done[0]) return;
                if (LocationManager.GPS_PROVIDER.equals(location.getProvider()) || !gps) {
                    done[0] = true;
                    lm.removeUpdates(this);
                    deliverLocation(id, location, null);
                } else if (netFix[0] == null || location.getAccuracy() < netFix[0].getAccuracy()) {
                    netFix[0] = location;
                }
            }
            @Override public void onStatusChanged(String p, int s, Bundle b) { }
            @Override public void onProviderEnabled(String p) { }
            @Override public void onProviderDisabled(String p) { }
        };
        try {
            if (gps) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, holder[0], Looper.getMainLooper());
            if (net) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0, 0, holder[0], Looper.getMainLooper());
        } catch (Exception e) {
            deliverLocation(id, fallback, null);
            return;
        }
        // GPS belum menjawab dalam 4 detik: pakai fix jaringan bila sudah ada.
        main.postDelayed(new Runnable() { @Override public void run() {
            if (done[0] || netFix[0] == null) return;
            done[0] = true;
            lm.removeUpdates(holder[0]);
            deliverLocation(id, netFix[0], null);
        }}, 4000);
        main.postDelayed(new Runnable() { @Override public void run() {
            if (done[0]) return;
            done[0] = true;
            lm.removeUpdates(holder[0]);
            Location f = netFix[0] != null ? netFix[0] : fallback;
            deliverLocation(id, f, f != null ? null : Lang.t("Sinyal lokasi lemah, coba lagi di area terbuka", "Weak location signal, try again in an open area"));
        }}, 15000);
    }

    /*
     * Pelacakan terus-menerus untuk layar "Bus di sekitarmu" (B1): GPS tiap 2 detik / 3 meter,
     * dikirim ke window.__lumiPos(lat, lon, acc). Dihentikan saat layar ditutup atau aplikasi ke latar.
     */
    private LocationListener watchL;
    @SuppressWarnings("MissingPermission")
    private void watchStart() {
        watchStop();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        final LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) return;
        final boolean gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        watchL = new LocationListener() {
            private long lastGps = 0;
            @Override public void onLocationChanged(Location l) {
                boolean isGps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
                if (isGps) lastGps = System.currentTimeMillis();
                else if (gps && System.currentTimeMillis() - lastGps < 10000) return;   // GPS masih jalan: abaikan jaringan
                js("window.__lumiPos && __lumiPos(" + l.getLatitude() + "," + l.getLongitude() + "," + (l.hasAccuracy() ? l.getAccuracy() : -1) + ")");
            }
            @Override public void onStatusChanged(String p, int s, Bundle b) { }
            @Override public void onProviderEnabled(String p) { }
            @Override public void onProviderDisabled(String p) { }
        };
        try {
            if (gps) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 3, watchL, Looper.getMainLooper());
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 10, watchL, Looper.getMainLooper());
        } catch (Exception ignored) { watchL = null; }
    }
    private void watchStop() {
        if (watchL == null) return;
        try { ((LocationManager) getSystemService(LOCATION_SERVICE)).removeUpdates(watchL); } catch (Exception ignored) { }
        watchL = null;
    }
    private boolean watchWanted;

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_PERM) { js("window.__lumiPerm && __lumiPerm()"); return; }
        if (code == REQ_GUIDE) {
            boolean ok = false;
            for (int i = 0; i < perms.length; i++)
                if (perms[i].contains("LOCATION") && results[i] == PackageManager.PERMISSION_GRANTED) ok = true;
            if (ok && pendingGuide != null) { NavService.start(this, pendingGuide[0], pendingGuide[1]); }
            else js("window.__lumiGuide && __lumiGuide({error:" + JSONObject.quote(Lang.t("Izin lokasi ditolak. Pendampingan butuh akses lokasi.", "Location permission denied. Guidance needs location access.")) + "})");
            pendingGuide = null;
            return;
        }
        if (code == REQ_LOCATION && pendingLocateId != null) {
            String id = pendingLocateId;
            pendingLocateId = null;
            boolean ok = false;
            for (int r : results) ok |= r == PackageManager.PERMISSION_GRANTED;
            if (ok) locateNow(id);
            else deliverLocation(id, null, Lang.t("Izin lokasi ditolak", "Location permission denied"));
        }
    }

    private static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
    private static final java.util.regex.Pattern[] COORD_PATTERNS = {
            java.util.regex.Pattern.compile("(?:!|%21)3d(-?\\d{1,2}\\.\\d+)(?:!|%21)4d(-?\\d{2,3}\\.\\d+)"),
            java.util.regex.Pattern.compile("@(-?\\d{1,2}\\.\\d{3,}),(-?\\d{2,3}\\.\\d{3,})"),
            java.util.regex.Pattern.compile("(?:center|ll|q|query|markers|destination|sll)=(-?\\d{1,2}\\.\\d{3,})(?:,|%2C)\\+?(-?\\d{2,3}\\.\\d{3,})"),
            java.util.regex.Pattern.compile("\\[null,null,(-?\\d{1,2}\\.\\d{4,}),(-?\\d{2,3}\\.\\d{4,})\\]"),
    };
    // APP_INITIALIZATION_STATE Google Maps: [[[skala, BUJUR, LINTANG], ...
    private static final java.util.regex.Pattern COORD_LONLAT =
            java.util.regex.Pattern.compile("\\[\\[\\[\\d+(?:\\.\\d+)?,(-?\\d{2,3}\\.\\d{4,}),(-?\\d{1,2}\\.\\d{4,})\\]");

    private static boolean inIndonesia(double la, double lo) { return la > -11.5 && la < 6.5 && lo > 94 && lo < 142; }

    /**
     * Koordinat TEMPAT dari URL Google Maps. Hanya pola yang menunjuk tempat itu sendiri:
     * "!3d<lat>!4d<lon>" (data tempat), atau "/place/â€¦/@lat,lon" dan "?q=lat,lon".
     * Koordinat tampilan peta di HTML (sering = perkiraan lokasi pengguna) sengaja diabaikan.
     */
    static String placeCoords(String url) {
        if (url == null) return null;
        java.util.regex.Matcher m = COORD_PATTERNS[0].matcher(url);
        String last = null;
        while (m.find()) {   // ambil kemunculan TERAKHIR: itu milik tempat utama di URL Google Maps
            try {
                double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
                if (inIndonesia(la, lo)) last = la + "," + lo;
            } catch (Exception ignored) { }
        }
        if (last != null) return last;
        if (url.contains("/place/") || url.contains("/dir/")) {
            m = COORD_PATTERNS[1].matcher(url);
            if (m.find()) {
                double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
                if (inIndonesia(la, lo)) return la + "," + lo;
            }
        }
        m = java.util.regex.Pattern.compile("[?&](?:q|query|ll|destination)=(-?\\d{1,2}\\.\\d{3,})(?:,|%2C)\\+?(-?\\d{2,3}\\.\\d{3,})").matcher(url);
        if (m.find()) {
            double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
            if (inIndonesia(la, lo)) return la + "," + lo;
        }
        return null;
    }

    /** (lama) pencarian longgar di teks; tidak dipakai lagi untuk tautan Google Maps. */
    static String findCoords(String text) {
        if (text == null) return null;
        for (java.util.regex.Pattern p : COORD_PATTERNS) {
            java.util.regex.Matcher m = p.matcher(text);
            while (m.find()) {
                try {
                    double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
                    if (inIndonesia(la, lo)) return la + "," + lo;
                } catch (Exception ignored) { }
            }
        }
        java.util.regex.Matcher m = COORD_LONLAT.matcher(text);
        while (m.find()) {
            try {
                double lo = Double.parseDouble(m.group(1)), la = Double.parseDouble(m.group(2));
                if (inIndonesia(la, lo)) return la + "," + lo;
            } catch (Exception ignored) { }
        }
        return null;
    }

    private final java.util.concurrent.ConcurrentHashMap<String, Boolean> resolvedIds = new java.util.concurrent.ConcurrentHashMap<String, Boolean>();
    private static final java.util.regex.Pattern MARKERS =
            java.util.regex.Pattern.compile("markers=(?:[^&\"']*?(?:%7C|\\|))?(-?\\d{1,2}\\.\\d{3,})(?:%2C|,)(-?\\d{2,3}\\.\\d{3,})");

    private android.content.SharedPreferences cache() { return getSharedPreferences("lumi_resolve", MODE_PRIVATE); }

    /** Kirim hasil sekali saja (HTTP dan WebView berlomba; yang pertama menang). */
    private final java.util.concurrent.ConcurrentHashMap<String, String> resolvedSource = new java.util.concurrent.ConcurrentHashMap<String, String>();
    private void deliverResolved(String id, String url, String coords) {
        if (resolvedIds.putIfAbsent(id, Boolean.TRUE) != null) return;
        if (coords != null && resolvedSource.get(id) != null) cache().edit().putString(resolvedSource.remove(id), coords).apply();
        String out = url;
        if (coords != null) out = url + (url.contains("?") ? "&" : "?") + "ll=" + coords;
        js("window.__lumiResolved(" + JSONObject.quote(id) + "," + JSONObject.quote(out) + ")");
    }

    /** Muat tautan di WebView tersembunyi dan tunggu koordinat muncul di URL/halaman (maks. 20 detik). */
    private void probe(final String id, final String url) {
        final WebView w = new WebView(this);
        final boolean[] done = {false};
        w.getSettings().setJavaScriptEnabled(true);
        w.getSettings().setDomStorageEnabled(true);
        w.getSettings().setUserAgentString(DESKTOP_UA);
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String s = req.getUrl().getScheme();
                return !("http".equals(s) || "https".equals(s));   // jangan lompat ke aplikasi lain
            }
        });
        w.getSettings().setBlockNetworkImage(true);   // tidak perlu gambar peta: lebih cepat
        w.getSettings().setLoadsImagesAutomatically(false);
        root.addView(w, new android.widget.FrameLayout.LayoutParams(400, 700));
        w.setTranslationX(-5000);
        final long start = System.currentTimeMillis();
        final Runnable[] tick = new Runnable[1];
        tick[0] = new Runnable() { @Override public void run() {
            if (done[0]) return;
            String cur = w.getUrl();
            String c = placeCoords(cur);
            boolean other = resolvedIds.containsKey(id);   // HTTP sudah lebih dulu menemukan
            if (other || c != null || System.currentTimeMillis() - start > 20000) {
                done[0] = true;
                if (!other) deliverResolved(id, cur != null ? cur : url, c);
                root.removeView(w);
                w.destroy();
                return;
            }
            main.postDelayed(tick[0], 250);
        }};
        w.loadUrl(url);
        main.postDelayed(tick[0], 300);
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line).append('\n');
        br.close();
        return sb.toString();
    }

    /**
     * Ambil satu URL Google Maps dengan header penyamaran aplikasi Google Maps.
     * Dipakai shouldInterceptRequest untuk petak peta (<img>) yang tidak bisa memasang header.
     * Mengembalikan null bila gagal supaya WebView memakai jalur normalnya.
     */
    private WebResourceResponse googleFetch(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(9000);
            c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept-Language", "id,en");
            for (java.util.Map.Entry<String, String> e : GoogleKeys.headers().entrySet()) {
                c.setRequestProperty(e.getKey(), e.getValue());
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) { c.disconnect(); return null; }
            String type = c.getContentType();
            String mime = type == null ? "image/png" : type.split(";")[0].trim();
            if (mime.isEmpty()) mime = "image/png";
            return new WebResourceResponse(mime, "utf-8", c.getInputStream());
        } catch (Exception e) {
            if (c != null) c.disconnect();
            return null;
        }
    }

    // ------------------------------------------------------------ bridge
    private class Bridge {
        @JavascriptInterface
        public void http(final String id, final String url) {
            httpH(id, url, null);
        }

        /** HTTP GET dengan header tambahan (JSON objek), mis. token tamu untuk API Transjakarta. */
        @JavascriptInterface
        public void httpH(final String id, final String url, final String headersJson) {
            pool.execute(new Runnable() { @Override public void run() {
                int status = 0;
                String body = "";
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestProperty("User-Agent", UA);
                    c.setRequestProperty("Accept-Language", "id,en");
                    c.setRequestProperty("Accept", "application/json");
                    if (headersJson != null && headersJson.length() > 2) {
                        JSONObject h = new JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    }
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(15000);
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) body = readAll(in);
                } catch (Exception e) {
                    status = 0;
                    body = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.__lumiHttp(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")");
            }});
        }

        /** Unduh & proses GTFS resmi Transjakarta di HP. Progres dikirim ke window.__lumiGtfs(status, pesan). */
        @JavascriptInterface
        public void updateGtfs() {
            pool.execute(new Runnable() { @Override public void run() {
                GtfsImporter.Progress prog = new GtfsImporter.Progress() {
                    public void update(String m) { js("window.__lumiGtfs && __lumiGtfs('progress'," + JSONObject.quote(m) + ")"); }
                };
                try {
                    RouteUpdater.Result r = RouteUpdater.run(MainActivity.this, prog, true);
                    js("window.__lumiGtfs && __lumiGtfs('done'," + JSONObject.quote(r.date.substring(0, 10)) + "," + r.changes + ")");
                } catch (Throwable e) {
                    js("window.__lumiGtfs && __lumiGtfs('error'," + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                }
            }});
        }

        /** Data rute hasil GTFS yang tersimpan (atau null). */
        @JavascriptInterface
        public String getRouteData() {
            try {
                java.io.File f = new java.io.File(getFilesDir(), "tj_gtfs.json");
                if (!f.exists()) return null;
                return readAll(new java.io.FileInputStream(f));
            } catch (Exception e) { return null; }
        }

        @JavascriptInterface
        public void clearRouteData() {
            new java.io.File(getFilesDir(), "tj_gtfs.json").delete();
        }

        /** Lokasi yang dibagikan sebelum halaman siap (dipanggil sekali saat start). */
        @JavascriptInterface
        public String takeShared() {
            String s = pendingShare;
            pendingShare = null;
            return s;
        }

        /** Ikuti redirect (tautan pendek Google Maps) dan kembalikan URL akhir. */
        @JavascriptInterface
        public void resolve(final String id, final String startUrl) {
            String cached = cache().getString(startUrl, null);
            if (cached != null) { deliverResolved(id, startUrl, cached); return; }
            if (placeCoords(startUrl) != null) { deliverResolved(id, startUrl, placeCoords(startUrl)); return; }
            resolvedSource.put(id, startUrl);
            // Jalankan dua cara sekaligus: WebView tersembunyi (langsung mulai) dan HTTP redirect + HTML.
            main.post(new Runnable() { @Override public void run() { probe(id, startUrl); }});
            pool.execute(new Runnable() { @Override public void run() {
                String url = startUrl;
                String found = placeCoords(url);
                try {
                    for (int i = 0; i < 8 && found == null; i++) {
                        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setRequestProperty("User-Agent", DESKTOP_UA);
                        c.setRequestProperty("Accept-Language", "id-ID,id;q=0.9,en;q=0.8");
                        c.setConnectTimeout(6000);
                        c.setReadTimeout(8000);
                        int code = c.getResponseCode();
                        String loc = c.getHeaderField("Location");
                        if (code >= 300 && code < 400 && loc != null) {
                            c.disconnect();
                            url = new URL(new URL(url), loc).toString();
                            found = placeCoords(url);
                            continue;
                        }
                        // Halaman tempat: gambar pratinjau (og:image staticmap) memuat "markers=lat,lon" milik tempat.
                        if (code == 200 && !resolvedIds.containsKey(id)) {
                            String html = readAll(c.getInputStream());
                            java.util.regex.Matcher m = MARKERS.matcher(html);
                            while (m.find() && found == null) {
                                double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
                                if (inIndonesia(la, lo)) found = la + "," + lo;
                            }
                            if (found == null) {
                                m = COORD_PATTERNS[0].matcher(html.length() > 400000 ? html.substring(0, 400000) : html);
                                // "!3dâ€¦!4dâ€¦" di HTML halaman /place/ = tempat itu sendiri
                                if (url.contains("/place/") && m.find()) {
                                    double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2));
                                    if (inIndonesia(la, lo)) found = la + "," + lo;
                                }
                            }
                        }
                        c.disconnect();
                        break;
                    }
                } catch (Exception ignored) { }
                if (found != null) deliverResolved(id, url, found);
                // bila belum ketemu, WebView tersembunyi yang sudah berjalan akan menyelesaikannya
            }});
        }

        @JavascriptInterface
        public void locate(final String id) {
            main.post(new Runnable() { @Override public void run() {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    pendingLocateId = id;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                } else {
                    locateNow(id);
                }
            }});
        }

        /** Pelacakan posisi terus-menerus (layar bus langsung): true = mulai, false = berhenti. */
        @JavascriptInterface
        public void watchPos(final boolean on) {
            main.post(new Runnable() { @Override public void run() { watchWanted = on; if (on) watchStart(); else watchStop(); }});
        }

        /** Buka aplikasi berdasarkan nama paket; jika tidak terpasang, buka Play Store. */
        @JavascriptInterface
        public void openApp(final String pkg) {
            main.post(new Runnable() { @Override public void run() {
                Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i != null) {
                    startActivity(i);
                } else {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
                    } catch (ActivityNotFoundException e) {
                        openExternal("https://play.google.com/store/apps/details?id=" + pkg);
                    }
                }
            }});
        }

        /** Versi aplikasi (versionName) untuk layar Tentang dan laporan bug. */
        @JavascriptInterface
        public String versionName() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (Exception e) { return "0"; }
        }

        /** Crash terakhir di sisi Android (untuk laporan bug); "" bila tidak ada. */
        @JavascriptInterface
        public String lastCrash() { return CrashLog.read(MainActivity.this); }

        /** Hapus catatan crash setelah laporan dibuat. */
        @JavascriptInterface
        public void clearCrash() { CrashLog.clear(MainActivity.this); }

        /** Panduan suara: ucapkan teks pendampingan. */
        @JavascriptInterface
        public void speak(final String text) { LumiTts.speak(MainActivity.this, text); }

        @JavascriptInterface
        public void stopSpeak() { LumiTts.stop(); }

        @JavascriptInterface
        public void openUrl(final String url) {
            main.post(new Runnable() { @Override public void run() { openExternal(url); }});
        }

        @JavascriptInterface
        public void share(final String text) {
            main.post(new Runnable() { @Override public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, Lang.t("Bagikan rute", "Share route")));
            }});
        }

        /** Riwayat perubahan rute (JSON). */
        @JavascriptInterface
        public String getChanges() { return RouteUpdater.changesJson(MainActivity.this); }

        @JavascriptInterface
        public void markChangesSeen() { RouteUpdater.markSeen(MainActivity.this); }

        /** Urutan halte sebelum/sesudah untuk satu perubahan rute (lihat RouteUpdater.changeDetail). */
        @JavascriptInterface
        public String getChangeDetail(String date, String code) { return RouteUpdater.changeDetail(MainActivity.this, date, code); }

        /** Mulai mode pendampingan. spec = titik-titik rute (lihat GuideTracker). */
        @JavascriptInterface
        public void startGuide(final String spec, final String title) {
            main.post(new Runnable() { @Override public void run() {
                java.util.List<String> need = new java.util.ArrayList<String>();
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    need.add(Manifest.permission.ACCESS_FINE_LOCATION);
                    need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                }
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
                    need.add("android.permission.POST_NOTIFICATIONS");
                boolean hasLoc = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
                if (!need.isEmpty() && (!hasLoc || need.contains("android.permission.POST_NOTIFICATIONS"))) {
                    pendingGuide = new String[]{spec, title};
                    if (hasLoc) need.add(Manifest.permission.ACCESS_FINE_LOCATION);   // agar hasil memuat izin lokasi
                    requestPermissions(need.toArray(new String[0]), REQ_GUIDE);
                } else {
                    NavService.start(MainActivity.this, spec, title);
                }
                updatePip(true);
            }});
        }

        @JavascriptInterface
        public void stopGuide() {
            main.post(new Runnable() { @Override public void run() { NavService.stop(MainActivity.this); updatePip(false); }});
        }

        /** Apakah Lokasi/GPS HP aktif. */
        @JavascriptInterface
        public boolean gpsOn() {
            LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm == null) return false;
            if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
            try { return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); }
            catch (Exception e) { return true; }
        }

        /** Buka pengaturan Lokasi HP. */
        @JavascriptInterface
        public void openGpsSettings() {
            main.post(new Runnable() { @Override public void run() {
                try { startActivity(new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)); }
                catch (ActivityNotFoundException e) { try { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); } catch (Exception ignored) { } }
            }});
        }

        @JavascriptInterface
        public boolean pipOk() { return pipSupported(); }

        /** Nyalakan/matikan kompas (hanya selama pendampingan, hemat baterai). */
        @JavascriptInterface
        public void compass(final boolean on) {
            main.post(new Runnable() { @Override public void run() { compassOn(on); }});
        }

        @JavascriptInterface
        public void enterPip() {
            main.post(new Runnable() { @Override public void run() { MainActivity.this.enterPip(); }});
        }

        /** Status pendampingan terakhir (JSON) bila sedang berjalan, atau null. */
        @JavascriptInterface
        public String guideState() { return NavService.tracker != null ? (NavService.lastJson != null ? NavService.lastJson : "{}") : null; }

        /** Tujuan dari notifikasi (guide/changes), sekali saat halaman siap. */
        @JavascriptInterface
        public String takeOpen() { String o = pendingOpen; pendingOpen = null; return o; }

        /** Inset system bar (dp) untuk halaman: {"top":..,"bottom":..,"ime":..}. */
        @JavascriptInterface
        public String insets() { return "{\"top\":" + insetsTop + ",\"bottom\":" + insetsBottom + ",\"ime\":" + imeOpen + "}"; }

        /** Bahasa aplikasi dari halaman ("id" / "en"): dipakai notifikasi, pendampingan, dan suara. */
        @JavascriptInterface
        public void setLang(String lang) { Lang.set(MainActivity.this, lang); }

        /** Status izin untuk layar "Satu langkah lagi". */
        @JavascriptInterface
        public String permState() {
            return "{\"loc\":" + hasLoc() + ",\"notif\":" + hasNotif() + ",\"battery\":" + hasBattery() +
                    ",\"oem\":" + isChineseOem() + ",\"brand\":" + JSONObject.quote(Build.MANUFACTURER) + "}";
        }

        /** Minta izin: loc | notif | battery. */
        @JavascriptInterface
        public void requestPerm(final String kind) {
            main.post(new Runnable() { @Override public void run() {
                try {
                    // Izin yang sudah ditolak permanen tidak memunculkan dialog lagi: arahkan ke info aplikasi,
                    // supaya pengguna tetap bisa mencentang semua izin di layar sambutan.
                    String perm = "loc".equals(kind) ? Manifest.permission.ACCESS_FINE_LOCATION
                            : ("notif".equals(kind) && Build.VERSION.SDK_INT >= 33) ? "android.permission.POST_NOTIFICATIONS" : null;
                    if (perm != null) {
                        android.content.SharedPreferences sp = getSharedPreferences("lumi", MODE_PRIVATE);
                        boolean asked = sp.getBoolean("askedPerm_" + kind, false);
                        sp.edit().putBoolean("askedPerm_" + kind, true).apply();
                        if (asked && checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED && !shouldShowRequestPermissionRationale(perm)) {
                            startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                            return;
                        }
                    }
                    if ("loc".equals(kind)) {
                        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERM);
                    } else if ("notif".equals(kind)) {
                        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_PERM);
                        else startActivity(new Intent("android.settings.APP_NOTIFICATION_SETTINGS").putExtra("android.provider.extra.APP_PACKAGE", getPackageName()));
                    } else if ("battery".equals(kind)) {
                        Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
                        try { startActivity(i); }
                        catch (Exception e) { startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
                    }
                } catch (Exception e) {
                    startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                }
            }});
        }

        /** Buka pengaturan "Mulai otomatis" (Xiaomi, Oppo, Vivo, Realme, Infinix, â€¦); cadangan: info aplikasi. */
        @JavascriptInterface
        public void openAutostart() {
            main.post(new Runnable() { @Override public void run() {
                String[][] comps = {
                        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                        {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
                        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                        {"com.oplus.safecenter", "com.oplus.safecenter.startupapp.StartupAppListActivity"},
                        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                        {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                        {"com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity"},
                        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                        {"com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"},
                };
                for (String[] c : comps) {
                    try {
                        Intent i = new Intent();
                        i.setComponent(new android.content.ComponentName(c[0], c[1]));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                        return;
                    } catch (Exception ignored) { }
                }
                startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            }});
        }

        /** Bagikan gambar rute (PNG base64) beserta teks singkat. */
        @JavascriptInterface
        public void shareImage(final String base64, final String text) {
            pool.execute(new Runnable() { @Override public void run() {
                try {
                    byte[] png = android.util.Base64.decode(base64.substring(base64.indexOf(',') + 1), android.util.Base64.DEFAULT);
                    java.io.File dir = ShareProvider.dir(MainActivity.this);
                    java.io.File[] old = dir.listFiles();
                    if (old != null) for (java.io.File f : old) f.delete();
                    String name = "rute-lumi-" + System.currentTimeMillis() + ".png";
                    java.io.FileOutputStream fo = new java.io.FileOutputStream(new java.io.File(dir, name));
                    fo.write(png);
                    fo.close();
                    final Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/" + name);
                    main.post(new Runnable() { @Override public void run() {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType("image/png");
                        i.putExtra(Intent.EXTRA_STREAM, uri);
                        if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
                        i.setClipData(android.content.ClipData.newRawUri("rute", uri));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, Lang.t("Bagikan rute", "Share route")));
                    }});
                } catch (Exception e) {
                    js("window.lumiToast && lumiToast(" + JSONObject.quote(Lang.t("Gagal membuat gambar rute", "Could not create the route image")) + ")");
                }
            }});
        }

        /** HTTP POST dengan header tambahan (JSON objek) dan body JSON; hasil ke window.__lumiHttp. */
        @JavascriptInterface
        public void httpPost(final String id, final String url, final String headersJson, final String body) {
            pool.execute(new Runnable() { @Override public void run() {
                int status = 0;
                String out = "";
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setRequestProperty("User-Agent", UA);
                    c.setRequestProperty("Accept-Language", "id,en");
                    c.setRequestProperty("Accept", "application/json");
                    c.setRequestProperty("Content-Type", "application/json");
                    if (headersJson != null && headersJson.length() > 2) {
                        JSONObject h = new JSONObject(headersJson);
                        java.util.Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    }
                    c.setConnectTimeout(12000);
                    c.setReadTimeout(15000);
                    if (body != null && body.length() > 0) {
                        java.io.OutputStream os = c.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.flush();
                        os.close();
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) out = readAll(in);
                } catch (Exception e) {
                    status = 0;
                    out = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.__lumiHttp(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(out) + ")");
            }});
        }

        /** Notifikasi "bus makin dekat" (kanal sendiri, prioritas tinggi). */
        @JavascriptInterface
        public void busNotify(final String title, final String text) {
            main.post(new Runnable() { @Override public void run() {
                try {
                    android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (nm == null) return;
                    String ch = "lumi_bus";
                    android.app.NotificationChannel c = new android.app.NotificationChannel(ch, Lang.t("Info bus", "Bus info"), android.app.NotificationManager.IMPORTANCE_HIGH);
                    c.setDescription(Lang.t("Bus yang kamu tunggu semakin dekat", "The bus you are waiting for is getting close"));
                    nm.createNotificationChannel(c);
                    String body = text == null ? "" : text;
                    android.app.Notification.Builder b = new android.app.Notification.Builder(MainActivity.this, ch);
                    b.setSmallIcon(android.R.drawable.ic_dialog_info)
                     .setContentTitle(title == null ? Lang.t("Info bus", "Bus info") : title)
                     .setContentText(body)
                     .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                     .setAutoCancel(true);
                    nm.notify(7003, b.build());
                } catch (Throwable ignored) { }
            }});
        }

        /* ---- posisi bus langsung: WebSocket native (byte MQTT diteruskan ke live.js) ---- */
        @JavascriptInterface
        public void liveOpen(final String url) {
            synchronized (liveLock) {
                if (live != null) live.close();
                liveQueue.clear();
                live = new LiveSocket(url, new LiveSocket.Listener() {
                    public void onOpen() { js("window.LumiLive && LumiLive.__nativeOpen()"); }
                    public void onData(byte[] d) {
                        synchronized (liveLock) { liveQueue.add(android.util.Base64.encodeToString(d, android.util.Base64.NO_WRAP)); }
                        scheduleLiveFlush();
                    }
                    public void onClose(String reason) { js("window.LumiLive && LumiLive.__nativeClose(" + JSONObject.quote(reason) + ")"); }
                });
                live.filter = liveFilterSet;
                live.start();
            }
        }

        /** Daftar kode rute yang ingin diterima (JSON array); kosong = semua. */
        @JavascriptInterface
        public void liveFilter(String json) {
            try {
                org.json.JSONArray a = new org.json.JSONArray(json);
                java.util.Set<String> f = new java.util.HashSet<String>();
                for (int i = 0; i < a.length(); i++) f.add(LiveSocket.norm(a.getString(i)));
                LiveSocket l = live;
                if (l != null) l.filter = f.isEmpty() ? null : f;
                liveFilterSet = f.isEmpty() ? null : f;
            } catch (Exception ignored) { }
        }

        /** Jumlah byte yang diterima koneksi saat ini (untuk info pemakaian kuota). */
        @JavascriptInterface
        public double liveBytes() { LiveSocket l = live; return l == null ? 0 : l.bytesIn; }

        @JavascriptInterface
        public void liveSend(String b64) {
            LiveSocket l = live;
            if (l != null) l.send(android.util.Base64.decode(b64, android.util.Base64.NO_WRAP));
        }

        @JavascriptInterface
        public void liveClose() {
            synchronized (liveLock) { if (live != null) live.close(); live = null; liveQueue.clear(); }
        }

        /** Buka aplikasi resmi TJ (pelacak bus resmi); bila belum terpasang, buka Play Store. */
        @JavascriptInterface
        public void openTjApp() {
            main.post(new Runnable() { @Override public void run() {
                for (String pkg : new String[]{"com.transjakmobile", "id.co.transjakarta.tije"}) {
                    Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                    if (i != null) { startActivity(i); return; }
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.transjakmobile"))); }
                catch (ActivityNotFoundException e) { openExternal("https://play.google.com/store/apps/details?id=com.transjakmobile"); }
            }});
        }

        @JavascriptInterface
        public String version() {
            return "2.4";
        }
    }
}

