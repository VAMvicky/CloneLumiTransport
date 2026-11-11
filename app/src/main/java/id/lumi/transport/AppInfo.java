package id.lumi.transport;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Satu tempat untuk identitas & versi yang dikirim ke server (v2.16).
 *
 * Dulu angka versi ditulis tangan di banyak tempat (User-Agent LiveSocket/RouteWatchJob/GtfsImporter,
 * header x-app-version di live.js, Bridge.version()) dan mudah terlewat saat rilis. Sekarang:
 *  - versi aplikasi  → BuildConfig.VERSION_NAME (dari release-notes/CURRENT lewat app/build.gradle)
 *  - versi klien TJ  → BuildConfig.TJ_CLIENT_VERSION (gradle.properties: lumi.tjClientVersion),
 *                      bisa ditimpa dari data/remote_config.json tanpa rilis baru.
 */
public final class AppInfo {
    private AppInfo() { }

    static final String PREFS = "lumi_remote";
    static final String KEY_TJ = "tjClientVersion";

    /** versionName aplikasi, mis. "2.16.0". */
    public static String version() { return BuildConfig.VERSION_NAME; }

    /** User-Agent tunggal Lumi untuk semua permintaan HTTP/WebSocket native. */
    public static String userAgent() { return "LumiTransport/" + BuildConfig.VERSION_NAME + " (Android)"; }

    /** Versi klien TJ untuk header x-app-version: nilai jarak jauh (bila valid) atau bawaan build. */
    public static String tjClientVersion(Context c) {
        if (c != null) {
            String v = prefs(c).getString(KEY_TJ, null);
            if (validVersion(v)) return v;
        }
        return BuildConfig.TJ_CLIENT_VERSION;
    }

    /** Simpan versi klien TJ dari remote_config.json (null/kosong = kembali ke bawaan build). */
    public static void setTjClientVersion(Context c, String v) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (validVersion(v)) e.putString(KEY_TJ, v); else e.remove(KEY_TJ);
        e.apply();
    }

    static boolean validVersion(String v) { return v != null && v.matches("\\d{1,3}(\\.\\d{1,4}){1,3}"); }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
