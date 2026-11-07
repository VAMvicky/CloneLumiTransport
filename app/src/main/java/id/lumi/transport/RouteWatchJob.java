package id.lumi.transport;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Pemantau perubahan rute TIAP JAM (ringan, beberapa KB):
 *  1) Umpan perubahan dari GitHub (data/route_changes.json), diisi GitHub Actions yang memeriksa
 *     GTFS resmi Transjakarta tiap jam → notifikasi langsung walau HP belum mengunduh GTFS.
 *  2) Tanda versi file GTFS resmi (ETag / Last-Modified / ukuran) lewat permintaan HEAD.
 * Jika salah satu berubah, data rute lengkap diunduh ulang (RouteUpdater) dan perbedaannya dicatat.
 */
public class RouteWatchJob extends JobService {
    static final int JOB_ID = 4243;
    static final String FEED = "https://raw.githubusercontent.com/VAMvicky/LumiTransport/main/data/route_changes.json";
    private Thread worker;

    public static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, RouteWatchJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(60L * 60 * 1000, 15L * 60 * 1000)
                .setPersisted(true)
                .build());
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        worker = new Thread(new Runnable() {
            @Override public void run() {
                try { check(RouteWatchJob.this); } catch (Throwable ignored) { }
                jobFinished(params, false);
            }
        });
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    static String httpGet(String url, int max) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        c.setRequestProperty("User-Agent", "LumiTransportation/2.0 (Android)");
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) return null;
            InputStream in = c.getInputStream();
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0 && bo.size() < max) bo.write(b, 0, n);
            return bo.toString("UTF-8");
        } finally { c.disconnect(); }
    }

    static void strs(org.json.JSONArray a, List<String> out) {
        for (int i = 0; a != null && i < a.length(); i++) out.add(a.optString(i));
    }
    static void dirs(org.json.JSONObject o, java.util.Map<String, List<String>> out) {
        if (o == null) return;
        java.util.Iterator<String> k = o.keys();
        while (k.hasNext()) { String d = k.next(); List<String> l = new ArrayList<String>(); strs(o.optJSONArray(d), l); out.put(d, l); }
    }

    /** Tanda versi GTFS resmi tanpa mengunduh seluruh file. */
    static String gtfsSignature() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(GtfsImporter.GTFS_URL).openConnection();
            c.setRequestMethod("HEAD");
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent", "LumiTransportation/2.0 (Android)");
            int code = c.getResponseCode();
            String sig = code + "|" + c.getHeaderField("ETag") + "|" + c.getHeaderField("Last-Modified") + "|" + c.getHeaderField("Content-Length");
            c.disconnect();
            return code == 200 ? sig : null;
        } catch (Exception e) { return null; }
    }

    static synchronized void check(Context ctx) throws Exception {
        SharedPreferences p = RouteUpdater.prefs(ctx);
        boolean needUpdate = false, notified = false;

        // 1) umpan GitHub
        try {
            String feed = httpGet(FEED, 200000);
            if (feed != null) {
                org.json.JSONObject o = new org.json.JSONObject(feed);
                int rev = o.optInt("rev", 0);
                int seen = p.getInt("feedRev", -1);
                if (seen < 0) {
                    p.edit().putInt("feedRev", rev).apply();          // pertama kali: hanya catat
                } else if (rev > seen) {
                    org.json.JSONObject latest = o.optJSONObject("latest");
                    List<RouteDiff.Item> items = new ArrayList<RouteDiff.Item>();
                    if (latest != null) {
                        org.json.JSONArray arr = latest.optJSONArray("items");
                        for (int i = 0; arr != null && i < arr.length(); i++) {
                            org.json.JSONObject x = arr.getJSONObject(i);
                            RouteDiff.Item it = new RouteDiff.Item();
                            it.kind = x.optString("k"); it.code = x.optString("code");
                            it.name = x.optString("name"); it.text = x.optString("text");
                            if (x.has("on")) it.oldName = x.optString("on");
                            strs(x.optJSONArray("add"), it.added); strs(x.optJSONArray("rm"), it.removed);
                            dirs(x.optJSONObject("b"), it.before); dirs(x.optJSONObject("a"), it.after);
                            items.add(it);
                        }
                        if (!items.isEmpty()) {
                            RouteUpdater.saveDetail(ctx, latest.optString("date"), RouteDiff.detailJson(items));
                            RouteUpdater.addHistory(ctx, RouteDiff.toJson(latest.optString("date"), items));
                            p.edit().putBoolean("unseen", true).apply();
                            RouteUpdater.notifyChanges(ctx, items);
                            notified = true;
                        }
                    }
                    p.edit().putInt("feedRev", rev).apply();
                    needUpdate = true;
                }
            }
        } catch (Exception ignored) { }

        // 2) tanda versi GTFS resmi
        String sig = gtfsSignature();
        if (sig != null) {
            String old = p.getString("gtfsSig", null);
            if (old != null && !old.equals(sig)) needUpdate = true;
            p.edit().putString("gtfsSig", sig).apply();
        }

        if (needUpdate) {
            RouteUpdater.run(ctx, new GtfsImporter.Progress() { public void update(String m) { } }, !notified);
        }
    }
}
