package id.lumi.transport;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Widget "Bus favorit" (v2.17): perkiraan tiba hingga 3 bus favorit di halte naiknya.
 *
 * Bus favorit dipilih di detail perjalanan (tombol "Widget ETA") dan disimpan di sini dengan bentuk yang
 * sama seperti pemantau bus (BusWatchService): {code, title, stop:{name,lat,lon,id}, next:{…}}.
 * Pembaruan: tugas latar tiap ±15 menit selama widget terpasang, dan saat tombol ⟳ diketuk. Setiap
 * pembaruan membuka koneksi feed armada sebentar (maks. ±12 detik, hanya rute favorit yang dilanggan),
 * menghitung ETA dengan BusEta, lalu menutup koneksi — hemat baterai & kuota.
 */
public class EtaWidget extends AppWidgetProvider {
    static final String PREFS = "lumi_eta_widget";
    static final String ACTION_REFRESH = "id.lumi.transport.ETA_REFRESH";
    static final int JOB_PERIODIC = 4250, JOB_NOW = 4251, MAX = 3;
    static final long LISTEN_MS = 12000;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ------------------------------------------------------------------ daftar bus favorit
    static JSONArray list(Context c) {
        try { return new JSONArray(prefs(c).getString("list", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static String key(JSONObject s) {
        JSONObject st = s.optJSONObject("stop");
        return LiveSocket.norm(s.optString("code")) + "|" + (st == null ? "" : st.optString("name"));
    }

    /** Pasang/lepas satu bus favorit. Mengembalikan true bila sekarang terpasang. */
    static synchronized boolean toggle(Context c, String json) throws Exception {
        JSONObject spec = new JSONObject(json);
        if (spec.optString("code").isEmpty() || spec.optJSONObject("stop") == null) throw new IllegalArgumentException("spec");
        JSONArray a = list(c), out = new JSONArray();
        boolean removed = false;
        String k = key(spec);
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.optJSONObject(i);
            if (x != null && key(x).equals(k)) { removed = true; continue; }
            if (x != null) out.put(x);
        }
        if (!removed) {
            if (out.length() >= MAX) out.remove(0);              // yang paling lama diganti
            out.put(spec);
        }
        prefs(c).edit().putString("list", out.toString()).remove("result").apply();
        refresh(c);
        if (out.length() > 0) runNow(c);
        return !removed;
    }

    static synchronized void setList(Context c, String json) throws Exception {
        JSONArray in = new JSONArray(json), out = new JSONArray();
        for (int i = 0; i < in.length() && out.length() < MAX; i++) {
            JSONObject x = in.optJSONObject(i);
            if (x != null && !x.optString("code").isEmpty() && x.optJSONObject("stop") != null) out.put(x);
        }
        prefs(c).edit().putString("list", out.toString()).remove("result").apply();
        refresh(c);
    }

    // ------------------------------------------------------------------ tampilan
    static final int[] ROWS = {R.id.weRow1, R.id.weRow2, R.id.weRow3};
    static final int[] NAMES = {R.id.weName1, R.id.weName2, R.id.weName3};
    static final int[] MINS = {R.id.weMin1, R.id.weMin2, R.id.weMin3};

    static String hhmm(long t) {
        java.util.Calendar cal = java.util.Calendar.getInstance(ReminderTime.WIB);
        cal.setTimeInMillis(t);
        return String.format(java.util.Locale.US, Lang.en ? "%02d:%02d" : "%02d.%02d", cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE));
    }

    static RemoteViews views(Context c) {
        Lang.load(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_eta);
        v.setTextViewText(R.id.weTitle, Lang.t("Bus favorit", "Favourite buses"));
        JSONArray a = list(c);
        JSONObject res = null;
        try { res = new JSONObject(prefs(c).getString("result", "{}")); } catch (Exception ignored) { }
        JSONObject items = res == null ? null : res.optJSONObject("items");
        long at = res == null ? 0 : res.optLong("at");
        boolean busy = System.currentTimeMillis() - prefs(c).getLong("busyAt", 0) < 120000;   // proses mati di tengah jalan → tidak macet
        for (int i = 0; i < MAX; i++) {
            if (i >= a.length()) { v.setViewVisibility(ROWS[i], View.GONE); continue; }
            JSONObject s = a.optJSONObject(i);
            JSONObject st = s.optJSONObject("stop");
            v.setViewVisibility(ROWS[i], View.VISIBLE);
            v.setTextViewText(NAMES[i], s.optString("code") + " · " + (st == null ? "" : st.optString("name")));
            JSONObject r = items == null ? null : items.optJSONObject(key(s));
            String m;
            if (r == null) m = busy ? "…" : "–";
            else {
                double e = r.optDouble("eta", -1);
                // ETA dihitung saat `at`; kurangi waktu yang sudah lewat sejak itu.
                double left = e - (System.currentTimeMillis() - at) / 60000.0;
                m = e < 0 ? "–" : left <= 0.5 ? Lang.t("tiba", "now") : Math.round(left) + Lang.t(" mnt", " min");
            }
            v.setTextViewText(MINS[i], m);
            v.setOnClickPendingIntent(ROWS[i], launch(c, "search"));
        }
        String foot;
        if (a.length() == 0) foot = Lang.t("Belum ada bus favorit. Di detail perjalanan, ketuk \"Widget ETA\" pada ruas bus.",
                "No favourite bus yet. In a trip's details, tap \"ETA widget\" on a bus leg.");
        else if (busy) foot = Lang.t("Memperbarui…", "Updating…");
        else if (at > 0) foot = Lang.t("Diperbarui ", "Updated ") + hhmm(at) + (res.optBoolean("noData") ? Lang.t(" · belum ada bus terpantau", " · no bus spotted yet") : "");
        else foot = Lang.t("Ketuk ⟳ untuk memperbarui", "Tap ⟳ to update");
        v.setTextViewText(R.id.weFoot, foot);
        v.setOnClickPendingIntent(R.id.weTitle, launch(c, "search"));
        Intent r = new Intent(c, EtaWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.weRefresh, PendingIntent.getBroadcast(c, 77, r, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    private static PendingIntent launch(Context c, String what) {
        Intent i = new Intent(c, MainActivity.class).putExtra("lumi_shortcut", what)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, ("eta" + what).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int[] ids(Context c) {
        try { return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, EtaWidget.class)); }
        catch (Exception e) { return new int[0]; }
    }

    static void refresh(Context c) {
        int[] ids = ids(c);
        if (ids == null || ids.length == 0) return;
        try { AppWidgetManager.getInstance(c).updateAppWidget(ids, views(c)); } catch (Exception ignored) { }
    }

    // ------------------------------------------------------------------ siklus widget
    @Override public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        mgr.updateAppWidget(ids, views(c));
        schedule(c);
    }

    @Override public void onEnabled(Context c) { schedule(c); runNow(c); }

    @Override public void onDisabled(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) { js.cancel(JOB_PERIODIC); js.cancel(JOB_NOW); }
    }

    @Override public void onReceive(Context c, Intent i) {
        if (i != null && ACTION_REFRESH.equals(i.getAction())) { runNow(c); return; }
        super.onReceive(c, i);
    }

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_PERIODIC) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_PERIODIC, new ComponentName(c, Job.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15L * 60 * 1000, 5L * 60 * 1000)
                    .setPersisted(true)
                    .build());
        } catch (Exception ignored) { }
    }

    static void runNow(Context c) {
        if (list(c).length() == 0) { refresh(c); return; }
        prefs(c).edit().putLong("busyAt", System.currentTimeMillis()).apply();
        refresh(c);
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_NOW, new ComponentName(c, Job.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setOverrideDeadline(60000)
                    .build());
        } catch (Exception e) { prefs(c).edit().putLong("busyAt", 0).apply(); refresh(c); }
    }

    // ------------------------------------------------------------------ pengambil ETA (thread latar)
    /**
     * Dengarkan feed armada sebentar dan kembalikan ETA terbaik per bus favorit: {key: {eta, bus}}.
     * Klien MQTT sama dengan BusWatchService (CONNECT anonim, SUBSCRIBE per rute, PUBLISH → JSON).
     */
    static JSONObject fetch(Context c, final JSONArray specs, long listenMs) {
        final JSONObject best = new JSONObject();
        final Set<String> codes = new HashSet<String>();
        final BusEta.Target[] targets = new BusEta.Target[specs.length()];
        final String[] keys = new String[specs.length()], norms = new String[specs.length()];
        for (int i = 0; i < specs.length(); i++) {
            JSONObject s = specs.optJSONObject(i);
            keys[i] = key(s); norms[i] = LiveSocket.norm(s.optString("code"));
            codes.add(norms[i]);
            BusEta.Target t = new BusEta.Target();
            JSONObject st = s.optJSONObject("stop"), nx = s.optJSONObject("next");
            if (st != null) { t.fromName = st.optString("name", null); t.fromLat = st.optDouble("lat"); t.fromLon = st.optDouble("lon"); t.fromId = BusWatchService.emptyNull(st.optString("id")); }
            if (nx != null) { t.toName = nx.optString("name", null); t.toLat = nx.optDouble("lat"); t.toLon = nx.optDouble("lon"); t.toId = BusWatchService.emptyNull(nx.optString("id")); }
            targets[i] = t;
        }
        for (int attempt = 0; attempt < 2; attempt++) {
            final boolean allTopic = attempt == 1;
            final CountDownLatch done = new CountDownLatch(1);
            final boolean[] gotData = {false};
            final LiveSocket[] holder = new LiveSocket[1];
            LiveSocket s = new LiveSocket(BusWatchService.URL, new LiveSocket.Listener() {
                public void onOpen() {
                    String cid = "mqttjs_" + Long.toHexString(Double.doubleToLongBits(Math.random())).substring(0, 8);
                    holder[0].send(BusWatchService.packet(0x10, BusWatchService.concat(BusWatchService.str("MQTT"), new byte[]{4, 0x02, 0, 60}, BusWatchService.str(cid))));
                }
                public void onData(byte[] b) {
                    int pos = 0;
                    while (b.length - pos >= 2) {
                        int mult = 1, len = 0, i = pos + 1, d;
                        do { if (i >= b.length) return; d = b[i++] & 0xFF; len += (d & 127) * mult; mult *= 128; } while ((d & 128) != 0);
                        if (i + len > b.length) return;
                        int type = (b[pos] & 0xFF) >> 4, flags = b[pos] & 15;
                        if (type == 2 && len >= 2 && b[i + 1] == 0) {
                            int pid = 1;
                            String[] topics = allTopic ? new String[]{"/mobile_armada/#"} : null;
                            if (topics == null) {
                                java.util.List<String> tl = new java.util.ArrayList<String>();
                                for (String cd : codes) for (String t : BusWatchService.topicsFor(cd)) tl.add(t);
                                topics = tl.toArray(new String[0]);
                            }
                            for (String t : topics) {
                                holder[0].send(BusWatchService.packet(0x82, BusWatchService.concat(new byte[]{(byte) (pid >> 8), (byte) pid}, BusWatchService.str(t), new byte[]{0})));
                                pid++;
                            }
                        } else if (type == 3 && len >= 2) {
                            int tl = ((b[i] & 0xFF) << 8) | (b[i + 1] & 0xFF), p = i + 2 + tl;
                            if ((flags >> 1 & 3) > 0 && p + 2 <= i + len) { holder[0].send(new byte[]{0x40, 2, b[p], b[p + 1]}); p += 2; }
                            if (p <= i + len) onMessage(new String(b, p, i + len - p, StandardCharsets.UTF_8));
                        }
                        pos = i + len;
                    }
                }
                void onMessage(String body) {
                    JSONObject msg;
                    try { msg = new JSONObject(body); } catch (Exception e) { return; }
                    gotData[0] = true;
                    String rc = LiveSocket.norm(msg.optString("route_code"));
                    synchronized (best) {
                        for (int k = 0; k < targets.length; k++) {
                            if (!rc.equals(norms[k])) continue;
                            double m = BusEta.minutes(msg, targets[k]);
                            if (m < 0) continue;
                            JSONObject cur = best.optJSONObject(keys[k]);
                            if (cur == null || m < cur.optDouble("eta", 1e9)) {
                                try { best.put(keys[k], new JSONObject().put("eta", m).put("bus", msg.optString("bus_body_no", ""))); } catch (Exception ignored) { }
                            }
                        }
                    }
                }
                public void onClose(String reason) { done.countDown(); }
            });
            s.filter = codes;
            holder[0] = s;
            s.start();
            long until = System.currentTimeMillis() + listenMs;
            try {
                while (System.currentTimeMillis() < until) {
                    if (done.await(500, TimeUnit.MILLISECONDS)) break;
                    synchronized (best) { if (best.length() >= specs.length() && System.currentTimeMillis() > until - listenMs + 4000) break; }
                }
            } catch (InterruptedException ignored) { }
            try { s.send(new byte[]{(byte) 0xE0, 0}); } catch (Exception ignored) { }
            s.close();
            // Server memutus langganan per rute tanpa data → coba sekali lewat topik umum (disaring LiveSocket).
            if (gotData[0] || done.getCount() > 0) break;
        }
        return best;
    }

    /** Tugas latar pembaru widget. */
    public static class Job extends JobService {
        @Override public boolean onStartJob(final JobParameters params) {
            final Context c = getApplicationContext();
            new Thread(new Runnable() { @Override public void run() {
                try {
                    JSONArray specs = list(c);
                    if (specs.length() > 0 && ids(c).length > 0 || params.getJobId() == JOB_NOW && specs.length() > 0) {
                        JSONObject items = fetch(c, specs, LISTEN_MS);
                        JSONObject res = new JSONObject().put("at", System.currentTimeMillis()).put("items", items).put("noData", items.length() == 0);
                        prefs(c).edit().putString("result", res.toString()).apply();
                    }
                } catch (Throwable ignored) {
                } finally {
                    prefs(c).edit().putLong("busyAt", 0).apply();
                    refresh(c);
                    jobFinished(params, false);
                }
            }}, "lumi-eta-widget").start();
            return true;
        }

        @Override public boolean onStopJob(JobParameters params) {
            prefs(getApplicationContext()).edit().putLong("busyAt", 0).apply();
            return false;
        }
    }
}
