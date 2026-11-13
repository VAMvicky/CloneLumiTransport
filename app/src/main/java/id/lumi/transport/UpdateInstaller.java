package id.lumi.transport;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Update langsung dari dalam aplikasi (v2.18): APK rilis terbaru diunduh ke cache, diperiksa (nama paket
 * sama, versi lebih baru, ukuran cocok), lalu pemasang Android dibuka lewat ShareProvider
 * (content://id.lumi.transport.share/update/…). Android tetap meminta konfirmasi pengguna, dan pembaruan
 * hanya diterima bila APK ditandatangani kunci yang sama dengan aplikasi terpasang.
 */
final class UpdateInstaller {
    private UpdateInstaller() { }

    interface Listener { void onState(JSONObject st); }

    static final long MAX_APK = 60L * 1024 * 1024;
    static volatile boolean busy;

    static File dir(Activity a) {
        File d = ShareProvider.updateDir(a);
        if (!d.isDirectory() && !d.mkdirs()) return a.getCacheDir();
        return d;
    }

    static String safeTag(String tag) { return tag == null ? "x" : tag.replaceAll("[^0-9A-Za-z.]", ""); }

    static JSONObject st(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return o;
    }

    static void start(final Activity a, final String url, final String tag, final long size, final Listener l) {
        if (busy) return;
        busy = true;
        new Thread(new Runnable() { @Override public void run() {
            try {
                if (!HostPolicy.isGithubDownload(url)) throw new IOException(Lang.t("alamat unduhan tidak dikenal", "unknown download address"));
                File apk = new File(dir(a), "LumiTransport-" + safeTag(tag) + ".apk");
                if (!(apk.isFile() && (size <= 0 || apk.length() == size) && check(a, apk) == null)) {
                    // Bersihkan unduhan lama
                    File[] old = dir(a).listFiles();
                    if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                        f.delete();
                    download(url, apk, size, tag, l);
                }
                String bad = check(a, apk);
                if (bad != null) { //noinspection ResultOfMethodCallIgnored
                    apk.delete(); throw new IOException(bad); }
                final File ready = apk;
                a.runOnUiThread(new Runnable() { @Override public void run() { install(a, ready, tag, l); } });
            } catch (Exception e) {
                l.onState(st("downloading", false, "error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), "tag", tag));
            } finally {
                busy = false;
            }
        }}, "lumi-update").start();
    }

    static void download(String url, File dest, long size, String tag, Listener l) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", AppInfo.userAgent());
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            if (!"https".equalsIgnoreCase(c.getURL().getProtocol())) throw new IOException("pengalihan tidak aman");
            long total = size > 0 ? size : c.getContentLength();
            if (total > MAX_APK) throw new IOException(Lang.t("APK terlalu besar", "APK too large"));
            File part = new File(dest.getPath() + ".part");
            long got = 0; int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) {
                    got += n;
                    if (got > MAX_APK || (total > 0 && got > total)) throw new IOException(Lang.t("ukuran APK tidak cocok", "APK size mismatch"));
                    out.write(buf, 0, n);
                    int p = total > 0 ? (int) (got * 100 / total) : 0;
                    if (p != last) { last = p; l.onState(st("downloading", true, "progress", p, "tag", tag)); }
                }
            } catch (IOException e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                throw e;
            }
            if (total > 0 && got != total) { //noinspection ResultOfMethodCallIgnored
                part.delete(); throw new IOException(Lang.t("unduhan terputus", "download interrupted")); }
            if (!part.renameTo(dest)) throw new IOException(Lang.t("gagal menyimpan APK", "couldn't save the APK"));
        } finally {
            c.disconnect();
        }
    }

    /** Sidik SHA-256 sertifikat penandatangan pertama, atau null. */
    private static String sigHash(PackageInfo p) {
        try {
            if (p.signatures == null || p.signatures.length == 0) return null;
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(p.signatures[0].toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    /** null bila APK layak dipasang; selain itu alasan penolakan. */
    @SuppressWarnings("deprecation")
    static String check(Activity a, File apk) {
        try {
            PackageInfo p = a.getPackageManager().getPackageArchiveInfo(apk.getPath(), android.content.pm.PackageManager.GET_SIGNATURES);
            if (p == null) return Lang.t("APK rusak", "corrupt APK");
            if (!a.getPackageName().equals(p.packageName)) return Lang.t("APK bukan Lumi Transport", "not a Lumi Transport APK");
            PackageInfo cur = a.getPackageManager().getPackageInfo(a.getPackageName(), android.content.pm.PackageManager.GET_SIGNATURES);
            // v2.20: pastikan APK ditandatangani kunci yang sama dengan yang terpasang.
            String sc = sigHash(cur), sn = sigHash(p);
            if (sc == null || sn == null || !sc.equals(sn)) {
                return Lang.t("APK bukan dari pengembang yang sama", "APK is not signed by the same developer");
            }
            long nv = android.os.Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
            long cv = android.os.Build.VERSION.SDK_INT >= 28 ? cur.getLongVersionCode() : cur.versionCode;
            if (nv <= cv) return Lang.t("versi APK tidak lebih baru", "APK version is not newer");
            return null;
        } catch (Exception e) { return Lang.t("APK tidak bisa dibaca", "APK can't be read"); }
    }

    static void install(Activity a, File apk, String tag, Listener l) {
        if (!a.getPackageManager().canRequestPackageInstalls()) {
            // Android 8+: izin "Instal aplikasi tak dikenal" untuk Lumi harus dinyalakan sekali.
            l.onState(st("downloading", false, "needPermission", true, "tag", tag));
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            } catch (ActivityNotFoundException ignored) { }
            return;
        }
        Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/update/" + apk.getName());
        Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            a.startActivity(i);
            l.onState(st("downloading", false, "installing", true, "needPermission", false, "tag", tag));
        } catch (ActivityNotFoundException e) {
            l.onState(st("downloading", false, "error", Lang.t("pemasang aplikasi tidak ditemukan", "no package installer found"), "tag", tag));
        }
    }
}
