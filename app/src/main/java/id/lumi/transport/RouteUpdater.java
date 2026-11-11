package id.lumi.transport;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobScheduler;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Pembaruan data rute Transjakarta (GTFS resmi) + deteksi perubahan rute.
 * Dipakai oleh tombol/auto-update di aplikasi dan oleh tugas harian (RouteUpdateJob).
 */
public class RouteUpdater {
    static final String CH_ROUTES = "lumi_routes";
    /** ID tugas harian lama (RouteUpdateJob); kini dibatalkan & digabung ke RouteWatchJob. */
    static final int LEGACY_JOB_ID = 4242, NOTIF_ID = 7101;
    static final long DAY = 24L * 60 * 60 * 1000;
    /** Unduhan penuh tidak diulang dalam rentang ini, apa pun pemicunya. */
    static final long MIN_GAP_MS = 30L * 60 * 1000;
    /** Setelah unduhan GAGAL, tugas latar menunggu lebih lama (hemat kuota bila server TJ sedang bermasalah). */
    static final long FAIL_GAP_MS = 6L * 60 * 60 * 1000;
    /** Tanda versi tidak terbaca → segarkan bila data lebih tua dari ini. */
    static final long STALE_UNKNOWN_MS = 20L * 60 * 60 * 1000;
    /** Batas umur data walau tanda versi tidak berubah. */
    static final long STALE_MAX_MS = 7L * DAY;
    /** Tanda versi GTFS (ETag/Last-Modified/ukuran) milik data yang tersimpan di HP. */
    static final String KEY_DATA_SIG = "dataSig";

    public static class Result { public String date; public int changes; public boolean first; }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("lumi_routes", Context.MODE_PRIVATE); }

    static String read(File f) throws java.io.IOException {
        InputStream in = new FileInputStream(f);
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[65536]; int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toString("UTF-8");
    }

    static void write(File f, String s) throws java.io.IOException {
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream fo = new FileOutputStream(tmp);
        fo.write(s.getBytes("UTF-8"));
        fo.close();
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    /**
     * Unduh penuh dari tugas latar, dengan penjaga bersama: dilewati bila unduhan (berhasil ATAU gagal)
     * terjadi kurang dari MIN_GAP_MS yang lalu. Mengembalikan null bila dilewati.
     */
    static synchronized Result runGuarded(Context ctx, boolean notify, String knownSig) throws Exception {
        SharedPreferences p = prefs(ctx);
        long now = System.currentTimeMillis();
        long ok = p.getLong("lastOk", 0), attempt = p.getLong("lastAttempt", 0);
        long last = Math.max(ok, attempt);
        long gap = attempt > ok ? FAIL_GAP_MS : MIN_GAP_MS;     // percobaan terakhir gagal → jeda 6 jam
        if (now - last < gap && now >= last) return null;
        return run(ctx, new GtfsImporter.Progress() { public void update(String m) { } }, notify, knownSig);
    }

    public static synchronized Result run(Context ctx, GtfsImporter.Progress p, boolean notify) throws Exception {
        return run(ctx, p, notify, null);
    }

    static synchronized Result run(Context ctx, GtfsImporter.Progress p, boolean notify, String knownSig) throws Exception {
        prefs(ctx).edit().putLong("lastAttempt", System.currentTimeMillis()).apply();
        File zip = new File(ctx.getCacheDir(), "file_gtfs.zip");
        GtfsImporter.download(GtfsImporter.GTFS_URL, zip, p);
        String date = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(new java.util.Date());
        StringBuilder idx = new StringBuilder();
        String json = GtfsImporter.summarize(zip, date.substring(0, 10), p, idx);
        zip.delete();
        write(new File(ctx.getFilesDir(), "tj_gtfs.json"), json);

        File idxFile = new File(ctx.getFilesDir(), "tj_index.txt");
        Result r = new Result();
        r.date = date;
        r.first = !idxFile.exists();
        if (!r.first) {
            List<RouteDiff.Item> items = RouteDiff.diff(read(idxFile), idx.toString());
            r.changes = items.size();
            if (!items.isEmpty()) {
                saveDetail(ctx, date, RouteDiff.detailJson(items));
                addHistory(ctx, RouteDiff.toJson(date, items));
                prefs(ctx).edit().putBoolean("unseen", true).apply();
                if (notify) notifyChanges(ctx, items);
            }
        }
        write(idxFile, idx.toString());
        // Catat tanda versi data yang baru diunduh, supaya RouteWatchJob tidak mengunduhnya lagi.
        String sig = knownSig != null ? knownSig : RouteWatchJob.gtfsSignature();
        SharedPreferences.Editor e = prefs(ctx).edit().putLong("lastOk", System.currentTimeMillis()).putString("lastDate", date);
        if (sig != null) e.putString(KEY_DATA_SIG, sig).putString("gtfsSig", sig);
        e.apply();
        return r;
    }

    /* Detail "sebelum / sesudah" (urutan halte lengkap) disimpan terpisah per pengecekan agar riwayat tetap ringan;
       dibaca hanya saat pengguna membuka satu perubahan. */
    static File detailDir(Context ctx) { File d = new File(ctx.getFilesDir(), "tj_changes_detail"); d.mkdirs(); return d; }
    static String detailKey(String date) { return String.valueOf(date).replaceAll("[^0-9]", ""); }
    static void saveDetail(Context ctx, String date, String json) {
        try {
            File d = detailDir(ctx);
            write(new File(d, detailKey(date) + ".json"), json);
            File[] fs = d.listFiles();
            if (fs != null && fs.length > 30) {
                java.util.Arrays.sort(fs, new java.util.Comparator<File>() { public int compare(File x, File y) { return y.getName().compareTo(x.getName()); } });
                for (int i = 30; i < fs.length; i++) fs[i].delete();
            }
        } catch (Exception ignored) { }
    }
    /** Detail satu rute pada satu pengecekan: {"b":{arah:[halte..]},"a":{..}} atau null. */
    public static String changeDetail(Context ctx, String date, String code) {
        try {
            File f = new File(detailDir(ctx), detailKey(date) + ".json");
            if (!f.exists()) return null;
            org.json.JSONObject o = new org.json.JSONObject(read(f));
            org.json.JSONObject x = o.optJSONObject(code);
            return x == null ? null : x.toString();
        } catch (Exception e) { return null; }
    }

    /** Riwayat perubahan: satu entri JSON per baris, terbaru di atas, maks. 30. */
    static void addHistory(Context ctx, String entry) throws java.io.IOException {
        File f = new File(ctx.getFilesDir(), "tj_changes.jsonl");
        List<String> lines = new ArrayList<String>();
        lines.add(entry);
        if (f.exists()) for (String l : read(f).split("\n")) if (l.trim().length() > 0 && lines.size() < 30) lines.add(l);
        StringBuilder sb = new StringBuilder();
        for (String l : lines) sb.append(l).append('\n');
        write(f, sb.toString());
    }

    public static String changesJson(Context ctx) {
        StringBuilder sb = new StringBuilder("{\"unseen\":").append(prefs(ctx).getBoolean("unseen", false));
        sb.append(",\"lastDate\":");
        GuideTracker.esc(sb, prefs(ctx).getString("lastDate", null));
        sb.append(",\"list\":[");
        try {
            File f = new File(ctx.getFilesDir(), "tj_changes.jsonl");
            if (f.exists()) {
                boolean first = true;
                for (String l : read(f).split("\n")) {
                    if (l.trim().isEmpty()) continue;
                    if (!first) sb.append(',');
                    first = false;
                    sb.append(l);
                }
            }
        } catch (Exception ignored) { }
        return sb.append("]}").toString();
    }

    public static void markSeen(Context ctx) { prefs(ctx).edit().putBoolean("unseen", false).apply(); }

    static void channel(Context ctx) {
        Lang.ensure(ctx);
        NotificationChannel c = new NotificationChannel(CH_ROUTES, Lang.t("Perubahan rute", "Route changes"), NotificationManager.IMPORTANCE_DEFAULT);
        c.setDescription(Lang.t("Info bila ada rute Transjakarta yang berubah (dicek tiap hari)", "Alerts when a Transjakarta route changes (checked daily)"));
        ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(c);
    }

    @SuppressWarnings("deprecation")
    static void notifyChanges(Context ctx, List<RouteDiff.Item> items) {
        channel(ctx);
        StringBuilder codes = new StringBuilder();
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            RouteDiff.Item it = items.get(i);
            if (i < 6) { if (i > 0) codes.append(", "); codes.append(it.code); }
            if (i < 8) body.append(it.code).append(": ").append(Lang.diff(it.text)).append('\n');
        }
        if (items.size() > 6) codes.append(Lang.t(" dll.", " etc."));
        Intent open = new Intent(ctx, MainActivity.class);
        open.putExtra("openChanges", true);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(ctx, CH_ROUTES);
        b.setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle(items.size() + Lang.t(" rute Transjakarta berubah", items.size() == 1 ? " Transjakarta route changed" : " Transjakarta routes changed"))
                .setContentText(codes.toString())
                .setStyle(new Notification.BigTextStyle().bigText(body.toString().trim()))
                .setColor(0xFF1565D8).setAutoCancel(true).setContentIntent(pi);
        try { ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIF_ID, b.build()); }
        catch (SecurityException ignored) { /* izin notifikasi belum diberikan */ }
    }

    /**
     * v2.16: hanya ada satu tugas latar (RouteWatchJob). Metode ini dipertahankan untuk pemanggil lama:
     * membatalkan tugas harian lama dan memastikan pemantau tiap jam terjadwal.
     */
    public static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(LEGACY_JOB_ID);
        RouteWatchJob.schedule(ctx);
    }

    static boolean freshEnough(Context ctx) {
        return System.currentTimeMillis() - prefs(ctx).getLong("lastOk", 0) < 20L * 60 * 60 * 1000;
    }
}
