package id.lumi.transport;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

/**
 * Pengingat "waktunya berangkat" (v2.16).
 *
 * Dari rute & jam tiba target, app.js menghitung jam harus keluar rumah ("berangkat 07.05 agar tiba
 * 08.00") lalu menyimpannya di sini. Alarm membangunkan ReminderReceiver beberapa menit sebelumnya
 * (sesuai pilihan pengguna) dan menampilkan notifikasi; mengetuknya membuka Lumi dengan rute yang sama.
 * Pengingat bisa sekali atau berulang (hari tertentu, mis. Senin–Jumat). Jadwal dipasang ulang setelah
 * HP dinyalakan ulang / aplikasi diperbarui. Pengingat terdekat juga tampil di widget Berangkat/Pulang.
 *
 * Mengecek kondisi terbaru (v2.16):
 *  - 30 menit sebelum notifikasi: gangguan layanan di rute pengingat (data/disruptions.json) → notifikasi
 *    "berangkat lebih awal" (hanya bila ada gangguan);
 *  - saat waktunya: notifikasi menyebut gangguan yang masih berlaku, dan bila ruas pertama naik bus
 *    TJ/Mikrotrans, pemantau "bus makin dekat" (BusWatchService) langsung dijalankan.
 *
 * Bentuk satu pengingat (JSON):
 * {id, title, from:{name,p}, to:{name,p}, sig, leave:"07:05", arrive:"08:00", lead:5, days:[1..7]|[],
 *  date:"2026-11-12" (sekali), summary:"TJ 9 → MRT", lines:[{id,code,mode}], bus:{spec BusWatchService}}
 * days memakai Calendar.DAY_OF_WEEK (1 = Minggu … 7 = Sabtu); jam selalu WIB.
 */
public final class Reminders {
    private Reminders() { }

    static final String PREFS = "lumi_reminders", KEY = "list", CH = "lumi_depart";
    static final String ACTION_FIRE = "id.lumi.transport.REMINDER", ACTION_PRE = "id.lumi.transport.REMINDER_PRE";
    static final long PRECHECK_MS = 30L * 60 * 1000;
    static final TimeZone WIB = TimeZone.getTimeZone("Asia/Jakarta");

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public static synchronized JSONArray list(Context c) {
        try { return new JSONArray(prefs(c).getString(KEY, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static synchronized void save(Context c, JSONArray a) { prefs(c).edit().putString(KEY, a.toString()).apply(); }

    /** Tambah/ganti pengingat (id sama = ganti). Mengembalikan waktu alarm berikutnya (ms) atau -1. */
    public static synchronized long put(Context c, String json) throws Exception {
        JSONObject r = new JSONObject(json);
        if (!r.optString("id").matches("[A-Za-z0-9_-]{1,40}")) throw new IllegalArgumentException("id");
        if (!r.optString("leave").matches("\\d{1,2}:\\d{2}")) throw new IllegalArgumentException("leave");
        JSONArray a = list(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) if (!r.optString("id").equals(a.getJSONObject(i).optString("id"))) out.put(a.get(i));
        out.put(r);
        if (out.length() > 20) throw new IllegalArgumentException("maks. 20 pengingat");
        save(c, out);
        long at = schedule(c, r);
        LumiWidgetProvider.refresh(c);
        return at;
    }

    public static synchronized void remove(Context c, String id) {
        JSONArray a = list(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r != null && id.equals(r.optString("id"))) cancel(c, r);
            else out.put(a.opt(i));
        }
        save(c, out);
        LumiWidgetProvider.refresh(c);
    }

    static JSONObject find(Context c, String id) {
        JSONArray a = list(c);
        for (int i = 0; i < a.length(); i++) { JSONObject r = a.optJSONObject(i); if (r != null && id.equals(r.optString("id"))) return r; }
        return null;
    }

    /** Waktu notifikasi berikutnya (ms, epoch) untuk pengingat ini setelah `after`, atau -1 bila sudah lewat. */
    static long nextFire(JSONObject r, long after) {
        String[] hm = r.optString("leave", "07:00").split(":");
        int lead = Math.max(0, Math.min(60, r.optInt("lead", 5)));
        JSONArray days = r.optJSONArray("days");
        Calendar cal = Calendar.getInstance(WIB);
        if (days == null || days.length() == 0) {
            String date = r.optString("date", "");
            if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) return -1;
            String[] d = date.split("-");
            cal.clear();
            cal.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]), Integer.parseInt(hm[0]), Integer.parseInt(hm[1]), 0);
            long t = cal.getTimeInMillis() - lead * 60000L;
            return t > after ? t : -1;
        }
        boolean[] on = new boolean[8];
        for (int i = 0; i < days.length(); i++) { int x = days.optInt(i); if (x >= 1 && x <= 7) on[x] = true; }
        cal.setTimeInMillis(after);
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0])); cal.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
        for (int k = 0; k < 8; k++) {
            long t = cal.getTimeInMillis() - lead * 60000L;
            if (on[cal.get(Calendar.DAY_OF_WEEK)] && t > after) return t;
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }

    static PendingIntent pi(Context c, String id, String action, int flags) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(action).putExtra("id", id);
        int rc = (ACTION_PRE.equals(action) ? "pre:" + id : id).hashCode();
        return PendingIntent.getBroadcast(c, rc, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void cancel(Context c, JSONObject r) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        for (String a : new String[]{ACTION_FIRE, ACTION_PRE}) {
            PendingIntent p = pi(c, r.optString("id"), a, PendingIntent.FLAG_NO_CREATE);
            if (am != null && p != null) { am.cancel(p); p.cancel(); }
        }
    }

    static void setAlarm(Context c, AlarmManager am, long at, PendingIntent p) {
        try {
            if (exactAllowed(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);   // tanpa izin: bisa mundur beberapa menit
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
    }

    /** Bisa memasang alarm tepat waktu? (Android 12+ butuh izin "Alarm & pengingat".) */
    public static boolean exactAllowed(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
    }

    static long schedule(Context c, JSONObject r) {
        long at = nextFire(r, System.currentTimeMillis());
        cancel(c, r);
        if (at < 0) return -1;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return -1;
        setAlarm(c, am, at, pi(c, r.optString("id"), ACTION_FIRE, PendingIntent.FLAG_UPDATE_CURRENT));
        // Cek gangguan 30 menit sebelumnya (hanya bila rutenya diketahui dan waktunya belum lewat).
        long pre = at - PRECHECK_MS;
        JSONArray lines = r.optJSONArray("lines");
        if (lines != null && lines.length() > 0 && pre > System.currentTimeMillis() + 60000)
            setAlarm(c, am, pre, pi(c, r.optString("id"), ACTION_PRE, PendingIntent.FLAG_UPDATE_CURRENT));
        return at;
    }

    /** Pasang ulang semua alarm (setelah boot / pembaruan aplikasi / izin alarm berubah). */
    public static void rescheduleAll(Context c) {
        JSONArray a = list(c), keep = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null) continue;
            if (schedule(c, r) >= 0) keep.put(r);           // pengingat sekali yang sudah lewat dibuang
        }
        save(c, keep);
        LumiWidgetProvider.refresh(c);
    }

    /** Pengingat terdekat untuk widget: {"leave":"07:05","to":"Kantor","at":ms} atau null. */
    static JSONObject nextForWidget(Context c) {
        JSONArray a = list(c);
        JSONObject best = null; long bestAt = Long.MAX_VALUE, now = System.currentTimeMillis();
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null) continue;
            long t = nextFire(r, now);
            if (t > 0 && t < bestAt) { bestAt = t; best = r; }
        }
        if (best == null) return null;
        try { return new JSONObject().put("leave", best.optString("leave")).put("to", best.optJSONObject("to") != null ? best.optJSONObject("to").optString("name") : "").put("at", bestAt).put("id", best.optString("id")); }
        catch (Exception e) { return null; }
    }

    static String disruptionLine(List<JSONObject> dis) {
        StringBuilder sb = new StringBuilder();
        for (JSONObject x : dis) {
            if (sb.length() > 0) sb.append('\n');
            String t = Disruptions.text(x, "text");
            sb.append("⚠ ").append(Disruptions.text(x, "title")).append(t.isEmpty() ? "" : " — " + t);
        }
        return sb.toString();
    }

    /** 30 menit sebelum: beri tahu hanya bila ada gangguan di rute pengingat. Thread latar. */
    static void precheck(Context c, String id) {
        JSONObject r = find(c, id);
        if (r == null) return;
        Lang.load(c);
        List<JSONObject> dis = Disruptions.affecting(Disruptions.fetch(), r.optJSONArray("lines"));
        if (dis.isEmpty()) return;
        String to = r.optJSONObject("to") != null ? r.optJSONObject("to").optString("name") : "";
        Disruptions.notify(c, 7250 + Math.abs(id.hashCode() % 40),
                Lang.t("Ada gangguan di rute berangkatmu (" + r.optString("leave").replace(':', '.') + ")", "Disruption on your " + r.optString("leave") + " trip"),
                disruptionLine(dis) + "\n" + Lang.t("Pertimbangkan berangkat lebih awal atau pilih rute lain ke " + to + ".", "Consider leaving earlier or taking another route to " + to + "."));
    }

    static List<JSONObject> currentDisruptions(JSONObject r) {
        JSONArray lines = r.optJSONArray("lines");
        if (lines == null || lines.length() == 0) return new java.util.ArrayList<JSONObject>();
        return Disruptions.affecting(Disruptions.fetch(), lines);
    }

    /**
     * Jalankan pemantau bus untuk ruas pertama pengingat ini. Harus dipanggil LANGSUNG di onReceive alarm
     * tepat waktu (pengecualian sistem untuk memulai layanan latar depan hanya berlaku sesaat).
     */
    static boolean startBusWatch(Context c, String id) {
        JSONObject r = find(c, id);
        JSONObject bus = r == null ? null : r.optJSONObject("bus");
        if (bus == null || !exactAllowed(c)) return false;
        try { return BusWatchService.start(c, bus.toString()); } catch (Exception e) { return false; }
    }

    @SuppressWarnings("deprecation")
    static void fire(Context c, String id, boolean busStarted) {
        JSONObject r = find(c, id);
        if (r == null) return;
        List<JSONObject> dis = currentDisruptions(r);          // kondisi terbaru (thread latar)
        Lang.load(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            NotificationChannel ch = new NotificationChannel(CH, Lang.t("Waktunya berangkat", "Time to leave"), NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(Lang.t("Pengingat jam berangkat agar tiba tepat waktu", "Reminders to leave so you arrive on time"));
            nm.createNotificationChannel(ch);
            String to = r.optJSONObject("to") != null ? r.optJSONObject("to").optString("name") : "";
            int lead = r.optInt("lead", 5);
            String title = lead > 0 ? Lang.t("Berangkat " + lead + " menit lagi", "Leave in " + lead + " min") : Lang.t("Waktunya berangkat", "Time to leave");
            String text = Lang.t("Berangkat " + r.optString("leave").replace(':', '.') + " agar tiba " + r.optString("arrive").replace(':', '.') + " di " + to,
                    "Leave at " + r.optString("leave") + " to arrive at " + to + " by " + r.optString("arrive"));
            String sum = r.optString("summary", "");
            if (!dis.isEmpty()) {
                title = "⚠ " + title + Lang.t(" · ada gangguan", " · disruption");
                sum = disruptionLine(dis) + (sum.isEmpty() ? "" : "\n" + sum);
            }
            JSONObject bus = r.optJSONObject("bus");
            if (bus != null && busStarted)
                text = text + Lang.t(" · Lumi memantau bus " + bus.optString("code") + " untukmu.", " · Lumi is watching the " + bus.optString("code") + " bus for you.");
            Intent open = new Intent(c, MainActivity.class).putExtra("lumi_shortcut", "reminder:" + id)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent op = PendingIntent.getActivity(c, ("open" + id).hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = new Notification.Builder(c, CH)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(sum.isEmpty() ? text : text + "\n" + sum))
                    .setAutoCancel(true).setColor(0xFF1565D8).setContentIntent(op)
                    .setCategory(Notification.CATEGORY_REMINDER);
            if (bus != null && !busStarted) {
                // Sistem tidak mengizinkan memulai pemantau otomatis (mis. alarm tidak tepat waktu): beri tombol.
                Intent w = new Intent(c, BusWatchService.class).putExtra("spec", bus.toString());
                PendingIntent wp = PendingIntent.getForegroundService(c, ("bus" + id).hashCode(), w, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                b.addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Lang.t("Pantau bus", "Watch the bus"), wp).build());
            }
            try { nm.notify(7200 + Math.abs(id.hashCode() % 500), b.build()); } catch (SecurityException ignored) { }
        }
        JSONArray days = r.optJSONArray("days");
        if (days == null || days.length() == 0) remove(c, id);   // sekali: selesai
        else { schedule(c, r); LumiWidgetProvider.refresh(c); }
    }

    /** Penerima alarm + boot + pembaruan aplikasi + perubahan izin alarm tepat. */
    public static class ReminderReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            String a = i == null ? null : i.getAction();
            if (ACTION_FIRE.equals(a) || ACTION_PRE.equals(a)) {
                final String id = i.getStringExtra("id");
                if (id == null) return;
                final boolean pre = ACTION_PRE.equals(a);
                final Context app = c.getApplicationContext();
                final boolean busStarted = !pre && startBusWatch(app, id);
                // Cek gangguan butuh internet → di thread latar; goAsync menjaga penerima tetap hidup.
                final PendingResult res = goAsync();
                new Thread(new Runnable() { @Override public void run() {
                    try { if (pre) precheck(app, id); else fire(app, id, busStarted); }
                    catch (Throwable ignored) { }
                    finally { res.finish(); }
                }}).start();
            } else {
                // BOOT_COMPLETED, MY_PACKAGE_REPLACED, SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
                rescheduleAll(c);
                try { RouteUpdater.schedule(c); } catch (Exception ignored) { }
                try { Disruptions.schedule(c); } catch (Exception ignored) { }
            }
        }
    }
}
