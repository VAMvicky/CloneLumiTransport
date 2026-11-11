package id.lumi.transport;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Info gangguan layanan di sisi native (v2.16): dipakai tanpa membuka aplikasi.
 *  - Disruptions.Job (tiap ±30 menit): gangguan baru yang mengenai rute di perjalanan favorit /
 *    pengingat → notifikasi, sekali per gangguan.
 *  - Reminders: dicek 30 menit sebelum & saat waktunya berangkat ("berangkat lebih awal").
 * Aturan cocok rute SAMA dengan app.js (disruptionsFor): lewat id/kode rute (+ moda bila diisi), atau
 * seluruh moda bila daftar rute kosong. Sumber: data/disruptions.json di repo.
 */
public final class Disruptions {
    private Disruptions() { }

    static final String FEED = "https://raw.githubusercontent.com/VAMvicky/LumiTransport/main/data/disruptions.json";
    static final String PREFS = "lumi_watch", CH = "lumi_disruption";
    static final int JOB_ID = 4244;

    /** Rute yang dipantau: [{"id":"krl-b","code":"B","mode":"KRL"}], diisi app.js dari favorit & pengingat. */
    public static void setWatched(Context c, String json) {
        try { new JSONArray(json); } catch (Exception e) { return; }
        prefs(c).edit().putString("lines", json).apply();
        schedule(c);
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONArray watched(Context c) {
        try { return new JSONArray(prefs(c).getString("lines", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static String key(String s) { return s == null ? "" : s.toUpperCase(java.util.Locale.US).replaceAll("[.\\s-]", ""); }

    /** Unduh daftar gangguan (null bila gagal / tidak sah). Dipanggil di thread latar. */
    static JSONArray fetch() {
        try {
            String body = RouteWatchJob.httpGet(FEED, 300000);
            if (body == null) return null;
            JSONObject o = new JSONObject(body);
            if (o.optInt("v") != 1) return null;
            return o.optJSONArray("items");
        } catch (Exception e) { return null; }
    }

    static long ts(String s) {
        if (s == null || s.isEmpty()) return -1;
        try {
            // ISO 8601 dengan zona, mis. 2026-11-11T05:00+07:00 (detik opsional)
            String x = s.replace("Z", "+00:00");
            if (x.matches(".*T\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}$")) x = x.replaceFirst("(T\\d{2}:\\d{2})", "$1:00");
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", java.util.Locale.US);
            return f.parse(x.replaceFirst("\\.\\d+", "")).getTime();
        } catch (Exception e) { return -2; }
    }

    static boolean active(JSONObject x, long now) {
        long a = ts(x.optString("from", null)), b = ts(x.optString("until", null));
        if (a == -2 || b == -2) return false;              // jam tidak terbaca → abaikan (sama dengan app.js)
        return (a < 0 || a <= now) && (b < 0 || b > now);
    }

    /** Apakah gangguan x mengenai rute {id, code, mode}. */
    static boolean matches(JSONObject x, JSONObject line) {
        JSONArray ls = x.optJSONArray("lines");
        String mode = x.optString("mode", "");
        String lm = line.optString("mode"), lid = line.optString("id"), lc = key(line.optString("code"));
        if (ls != null && ls.length() > 0) {
            boolean hit = false;
            for (int i = 0; i < ls.length(); i++) {
                String k = key(ls.optString(i));
                if (k.equals(lc) || k.equals(key(lid))) { hit = true; break; }
            }
            return hit && (mode.isEmpty() || mode.equals(lm));
        }
        return !mode.isEmpty() && mode.equals(lm);
    }

    static String text(JSONObject x, String k) {
        Object v = x.opt(k);
        if (v instanceof String) return (String) v;
        if (v instanceof JSONObject) {
            JSONObject o = (JSONObject) v;
            String en = o.optString("en", ""), id = o.optString("id", "");
            return Lang.en && !en.isEmpty() ? en : !id.isEmpty() ? id : en;
        }
        return "";
    }

    /** Gangguan aktif yang mengenai salah satu rute dalam `lines`. */
    static List<JSONObject> affecting(JSONArray items, JSONArray lines) {
        List<JSONObject> out = new ArrayList<JSONObject>();
        if (items == null || lines == null) return out;
        long now = System.currentTimeMillis();
        for (int i = 0; i < items.length(); i++) {
            JSONObject x = items.optJSONObject(i);
            if (x == null || !active(x, now)) continue;
            for (int j = 0; j < lines.length(); j++) {
                JSONObject l = lines.optJSONObject(j);
                if (l != null && matches(x, l)) { out.add(x); break; }
            }
        }
        return out;
    }

    static void channel(Context c) {
        Lang.ensure(c);
        NotificationChannel ch = new NotificationChannel(CH, Lang.t("Gangguan rute favorit", "Disruptions on favourite routes"), NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(Lang.t("Kereta telat, koridor dialihkan, halte tutup di rute yang kamu simpan", "Delays, diversions and closed stops on routes you saved"));
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    static void notify(Context c, int id, String title, String text) {
        channel(c);
        Intent open = new Intent(c, MainActivity.class).putExtra("openDisruptions", true)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 5, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(c, CH)
                .setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setColor(0xFFC2410C).setContentIntent(pi);
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id, b.build()); } catch (SecurityException ignored) { }
    }

    /** Periksa gangguan baru untuk rute favorit; tiap gangguan hanya diberitahukan sekali. */
    static void checkFavourites(Context c) {
        JSONArray lines = watched(c);
        if (lines.length() == 0) return;
        List<JSONObject> hits = affecting(fetch(), lines);
        SharedPreferences p = prefs(c);
        JSONObject seen;
        try { seen = new JSONObject(p.getString("seen", "{}")); } catch (Exception e) { seen = new JSONObject(); }
        long now = System.currentTimeMillis();
        List<JSONObject> fresh = new ArrayList<JSONObject>();
        for (JSONObject x : hits) {
            String id = x.optString("id");
            if (!seen.has(id)) fresh.add(x);
            try { seen.put(id, now); } catch (Exception ignored) { }
        }
        // lupakan yang sudah > 7 hari
        JSONObject keep = new JSONObject();
        java.util.Iterator<String> it = seen.keys();
        while (it.hasNext()) { String k = it.next(); long t = seen.optLong(k); if (now - t < 7L * 86400000) try { keep.put(k, t); } catch (Exception ignored) { } }
        p.edit().putString("seen", keep.toString()).apply();
        if (fresh.isEmpty()) return;
        Lang.load(c);
        JSONObject f = fresh.get(0);
        String title = fresh.size() == 1 ? "⚠ " + text(f, "title") : "⚠ " + fresh.size() + Lang.t(" gangguan di rute favoritmu", " disruptions on your favourite routes");
        StringBuilder body = new StringBuilder();
        for (JSONObject x : fresh) {
            if (body.length() > 0) body.append('\n');
            body.append(fresh.size() == 1 ? text(x, "text") : text(x, "title") + " — " + text(x, "text"));
        }
        notify(c, 7300, title, body.toString().trim());
    }

    public static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (watched(c).length() == 0) { js.cancel(JOB_ID); return; }
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, Job.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(30L * 60 * 1000, 10L * 60 * 1000)
                .setPersisted(true)
                .build());
    }

    /** Tugas latar pemeriksa gangguan rute favorit. */
    public static class Job extends JobService {
        @Override
        public boolean onStartJob(final JobParameters params) {
            Lang.load(this);
            new Thread(new Runnable() { @Override public void run() {
                try { checkFavourites(Job.this); } catch (Throwable ignored) { }
                jobFinished(params, false);
            }}).start();
            return true;
        }
        @Override public boolean onStopJob(JobParameters params) { return true; }
    }
}
