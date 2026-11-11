package id.lumi.transport;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Peta offline Jabodetabek (v2.17).
 *
 * Paket peta (dibangun workflow "Peta offline" dari OpenStreetMap dengan Planetiler, skema OpenMapTiles,
 * gaya OpenFreeMap Liberty) diunduh sekali dari rilis GitHub "peta-offline": satu zip berisi
 *   tiles.pmtiles · style.json · fonts/&lt;font&gt;/&lt;range&gt;.pbf · sprites/ofm[@2x].{json,png}
 * lalu diekstrak ke files/offline-map. Halaman memakai protokol MapLibre "lumioff://", yang diteruskan
 * ke https://lumi-offline.local/… dan dilayani di sini (shouldInterceptRequest) tanpa jaringan.
 */
final class OfflineMap {
    private OfflineMap() { }

    static final String HOST = "lumi-offline.local";
    static final String RELEASE = "https://github.com/VAMvicky/TransportBCK/releases/download/peta-offline/";
    static final String MANIFEST = "peta-jabodetabek.json", ZIP = "peta-jabodetabek.zip";
    static final long MAX_ZIP = 400L * 1024 * 1024;

    interface Listener { void onState(String json); }

    static volatile boolean downloading;
    static volatile int progress = -1;
    static volatile String lastError;
    private static PmTiles tiles;

    static File dir(Context c) { return new File(c.getFilesDir(), "offline-map"); }

    static boolean ready(Context c) {
        File d = dir(c);
        return new File(d, "tiles.pmtiles").isFile() && new File(d, "style.json").isFile() && new File(d, "manifest.json").isFile();
    }

    static String state(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("ready", ready(c)).put("downloading", downloading).put("progress", progress);
            if (lastError != null) o.put("error", lastError);
            if (ready(c)) {
                JSONObject m = new JSONObject(read(new File(dir(c), "manifest.json")));
                o.put("date", m.optString("date")).put("bytes", size(dir(c)));
            }
        } catch (Exception ignored) { }
        return o.toString();
    }

    static long size(File f) {
        if (f.isFile()) return f.length();
        long n = 0;
        File[] k = f.listFiles();
        if (k != null) for (File x : k) n += size(x);
        return n;
    }

    static void deleteTree(File f) {
        File[] k = f.listFiles();
        if (k != null) for (File x : k) deleteTree(x);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    static synchronized void closeTiles() {
        if (tiles != null) { try { tiles.close(); } catch (IOException ignored) { } tiles = null; }
    }

    static void delete(Context c) {
        closeTiles();
        deleteTree(dir(c));
        lastError = null;
    }

    static String read(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) { return new String(readAll(in, 4 * 1024 * 1024), "UTF-8"); }
    }

    static byte[] readAll(InputStream in, int max) throws IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) { b.write(buf, 0, n); if (b.size() > max) throw new IOException("terlalu besar"); }
        return b.toByteArray();
    }

    static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", AppInfo.userAgent());
        return c;
    }

    // ------------------------------------------------------------------ unduh
    static void download(final Context ctx, final Listener l) {
        if (downloading) return;
        downloading = true; progress = 0; lastError = null;
        final Context c = ctx.getApplicationContext();
        new Thread(new Runnable() { @Override public void run() {
            File tmpZip = new File(c.getCacheDir(), ZIP + ".part");
            File stage = new File(c.getFilesDir(), "offline-map.new");
            try {
                Lang.load(c);
                notifyProgress(c, 0, false);
                JSONObject man;
                HttpURLConnection mc = open(RELEASE + MANIFEST);
                try {
                    if (mc.getResponseCode() != 200) throw new IOException(Lang.t("Paket peta belum tersedia (HTTP ", "Map package not available yet (HTTP ") + mc.getResponseCode() + ")");
                    try (InputStream in = mc.getInputStream()) { man = new JSONObject(new String(readAll(in, 65536), "UTF-8")); }
                } finally { mc.disconnect(); }
                long want = man.optLong("bytes");
                String sha = man.optString("sha256").toLowerCase(Locale.US);
                if (man.optInt("v") != 1 || want <= 0 || want > MAX_ZIP || !sha.matches("[0-9a-f]{64}")) throw new IOException(Lang.t("Info paket peta tidak sah", "Invalid map package info"));

                HttpURLConnection zc = open(RELEASE + ZIP);
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                try {
                    if (zc.getResponseCode() != 200) throw new IOException("HTTP " + zc.getResponseCode());
                    long got = 0; int last = -1;
                    try (InputStream in = zc.getInputStream(); OutputStream out = new FileOutputStream(tmpZip)) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) {
                            got += n;
                            if (got > want) throw new IOException(Lang.t("Ukuran paket peta tidak cocok", "Map package size mismatch"));
                            out.write(buf, 0, n); md.update(buf, 0, n);
                            int p = (int) (got * 90 / want);
                            if (p != last) { last = p; progress = p; notifyProgress(c, p, false); if (l != null) l.onState(state(c)); }
                        }
                    }
                    if (got != want) throw new IOException(Lang.t("Unduhan terputus", "Download interrupted"));
                } finally { zc.disconnect(); }
                if (!hex(md.digest()).equals(sha)) throw new IOException(Lang.t("Paket peta rusak (checksum)", "Map package corrupted (checksum)"));

                deleteTree(stage);
                unzip(tmpZip, stage);
                if (!new File(stage, "tiles.pmtiles").isFile() || !new File(stage, "style.json").isFile()) throw new IOException(Lang.t("Isi paket peta tidak lengkap", "Map package incomplete"));
                new PmTiles(new File(stage, "tiles.pmtiles")).close();     // pastikan arsip terbaca
                try (OutputStream o = new FileOutputStream(new File(stage, "manifest.json"))) { o.write(man.toString().getBytes("UTF-8")); }
                closeTiles();
                deleteTree(dir(c));
                if (!stage.renameTo(dir(c))) throw new IOException(Lang.t("Gagal menyimpan peta", "Couldn't save the map"));
                progress = 100;
                notifyProgress(c, 100, true);
            } catch (Exception e) {
                lastError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                deleteTree(stage);
                cancelNotif(c);
            } finally {
                //noinspection ResultOfMethodCallIgnored
                tmpZip.delete();
                downloading = false;
                if (l != null) l.onState(state(c));
            }
        }}, "lumi-offline-map").start();
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.US, "%02x", x & 0xFF));
        return sb.toString();
    }

    /** Ekstrak zip dengan penjaga "zip slip" (entri tidak boleh keluar dari folder tujuan). */
    static void unzip(File zip, File to) throws IOException {
        if (!to.mkdirs() && !to.isDirectory()) throw new IOException("mkdir");
        String root = to.getCanonicalPath() + File.separator;
        long total = 0;
        try (ZipInputStream z = new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry e; byte[] buf = new byte[65536];
            while ((e = z.getNextEntry()) != null) {
                File f = new File(to, e.getName());
                if (!f.getCanonicalPath().startsWith(root)) throw new IOException("entri zip tidak sah: " + e.getName());
                if (e.isDirectory()) { //noinspection ResultOfMethodCallIgnored
                    f.mkdirs(); continue; }
                File parent = f.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("mkdir");
                try (OutputStream o = new FileOutputStream(f)) {
                    int n;
                    while ((n = z.read(buf)) > 0) { total += n; if (total > MAX_ZIP * 2) throw new IOException("isi zip terlalu besar"); o.write(buf, 0, n); }
                }
            }
        }
    }

    static void notifyProgress(Context c, int p, boolean done) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel("lumi_offline", Lang.t("Peta offline", "Offline map"), NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
            Notification.Builder b = new Notification.Builder(c, "lumi_offline")
                    .setSmallIcon(done ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_sys_download)
                    .setContentTitle(done ? Lang.t("Peta offline Jabodetabek siap", "Jabodetabek offline map ready")
                            : Lang.t("Mengunduh peta offline Jabodetabek", "Downloading the Jabodetabek offline map"))
                    .setOnlyAlertOnce(true).setColor(0xFF1565D8).setAutoCancel(done);
            if (!done) b.setProgress(100, p, p <= 0).setOngoing(true).setContentText(p + "%");
            nm.notify(NotifIds.OFFLINE_MAP, b.build());
        } catch (Exception ignored) { }
    }

    static void cancelNotif(Context c) {
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NotifIds.OFFLINE_MAP); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------ layani permintaan halaman
    static synchronized PmTiles tiles(Context c) throws IOException {
        if (tiles == null) tiles = new PmTiles(new File(dir(c), "tiles.pmtiles"));
        return tiles;
    }

    static WebResourceResponse respond(int code, String mime, byte[] body) {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "max-age=86400");
        String reason = code == 200 ? "OK" : code == 204 ? "No Content" : "Not Found";
        return new WebResourceResponse(mime, null, code, reason, h, new ByteArrayInputStream(body == null ? new byte[0] : body));
    }

    static String mime(String path) {
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        return "application/x-protobuf";
    }

    /** Jawaban untuk https://lumi-offline.local/&lt;path&gt;. Petak yang tidak ada → 204 (kosong). */
    static WebResourceResponse serve(Context c, Uri u) {
        try {
            if (!ready(c)) return respond(404, "text/plain", null);
            String path = u.getPath() == null ? "" : u.getPath();
            if (path.startsWith("/t/")) {
                String[] p = path.substring(3).replaceAll("\\.pbf$", "").split("/");
                if (p.length != 3) return respond(404, "text/plain", null);
                byte[] t = tiles(c).tile(Integer.parseInt(p[0]), Long.parseLong(p[1]), Long.parseLong(p[2]));
                return t == null ? respond(204, "application/x-protobuf", null) : respond(200, "application/x-protobuf", t);
            }
            File root = dir(c).getCanonicalFile();
            File f = new File(root, Uri.decode(path.startsWith("/") ? path.substring(1) : path)).getCanonicalFile();
            if (!f.getPath().startsWith(root.getPath() + File.separator) || !f.isFile() || f.getName().equals("tiles.pmtiles"))
                return respond(path.startsWith("/fonts/") ? 204 : 404, mime(path), null);
            try (InputStream in = new FileInputStream(f)) { return respond(200, mime(path), readAll(in, 8 * 1024 * 1024)); }
        } catch (Exception e) {
            return respond(404, "text/plain", null);
        }
    }
}
