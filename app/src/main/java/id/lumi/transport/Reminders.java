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
import java.util.TimeZone;

/**
 * Pengingat "waktunya berangkat" (v2.15).
 *
 * Dari rute & jam tiba target, app.js menghitung jam harus keluar rumah ("berangkat 07.05 agar tiba
 * 08.00") lalu menyimpannya di sini. Alarm membangunkan ReminderReceiver beberapa menit sebelumnya
 * (sesuai pilihan pengguna) dan menampilkan notifikasi; mengetuknya membuka Lumi dengan rute yang sama.
 * Pengingat bisa sekali atau berulang (hari tertentu, mis. Senin–Jumat). Jadwal dipasang ulang setelah
 * HP dinyalakan ulang / aplikasi diperbarui. Pengingat terdekat juga tampil di widget Berangkat/Pulang.
 *
 * Bentuk satu pengingat (JSON):
 * {id, title, from:{name,p}, to:{name,p}, sig, leave:"07:05", arrive:"08:00", lead:5, days:[1..7]|[],
 *  date:"2026-11-12" (sekali), summary:"TJ 9 → MRT"}
 * days memakai Calendar.DAY_OF_WEEK (1 = Minggu … 7 = Sabtu); jam selalu WIB.
 */
public final class Reminders {
    private Reminders() { }

    static final String PREFS = "lumi_reminders", KEY = "list", CH = "lumi_depart";
    static final String ACTION_FIRE = "id.lumi.transport.REMINDER";
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

    static PendingIntent pi(Context c, String id, int flags) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_FIRE).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void cancel(Context c, JSONObject r) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent p = pi(c, r.optString("id"), PendingIntent.FLAG_NO_CREATE);
        if (am != null && p != null) { am.cancel(p); p.cancel(); }
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
        PendingIntent p = pi(c, r.optString("id"), PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (exactAllowed(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);   // tanpa izin: bisa mundur beberapa menit
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
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

    @SuppressWarnings("deprecation")
    static void fire(Context c, String id) {
        JSONObject r = find(c, id);
        if (r == null) return;
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
            Intent open = new Intent(c, MainActivity.class).putExtra("lumi_shortcut", "reminder:" + id)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent op = PendingIntent.getActivity(c, ("open" + id).hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = new Notification.Builder(c, CH)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(sum.isEmpty() ? text : text + "\n" + sum))
                    .setAutoCancel(true).setColor(0xFF1565D8).setContentIntent(op)
                    .setCategory(Notification.CATEGORY_REMINDER);
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
            if (ACTION_FIRE.equals(a)) {
                String id = i.getStringExtra("id");
                if (id != null) fire(c, id);
            } else {
                // BOOT_COMPLETED, MY_PACKAGE_REPLACED, SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
                rescheduleAll(c);
                try { RouteUpdater.schedule(c); } catch (Exception ignored) { }
            }
        }
    }
}
