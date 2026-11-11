package id.lumi.transport;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Hitungan waktu pengingat berangkat tanpa ketergantungan Android (v2.17: dipisah dari Reminders
 * supaya bisa diuji unit). Semua jam memakai WIB.
 */
final class ReminderTime {
    private ReminderTime() { }

    static final TimeZone WIB = TimeZone.getTimeZone("Asia/Jakarta");

    /** "07:05" → {7, 5}; null bila bentuknya salah atau di luar 00:00–23:59. */
    static int[] hm(String s) {
        if (s == null || !s.matches("\\d{1,2}:\\d{2}")) return null;
        String[] p = s.split(":");
        int h = Integer.parseInt(p[0]), m = Integer.parseInt(p[1]);
        if (h > 23 || m > 59) return null;
        return new int[]{h, m};
    }

    /**
     * Waktu notifikasi berikutnya (ms epoch) setelah `after`, atau -1 bila sudah lewat / tidak sah.
     *
     * @param leave jam keluar rumah "HH:MM" (WIB)
     * @param lead  menit sebelum `leave` notifikasi dibunyikan (0–60)
     * @param days  hari berulang memakai Calendar.DAY_OF_WEEK (1 = Minggu … 7 = Sabtu); kosong/null = sekali
     * @param date  tanggal "yyyy-MM-dd" untuk pengingat sekali
     */
    static long nextFire(String leave, int lead, int[] days, String date, long after) {
        int[] t = hm(leave);
        if (t == null) return -1;
        lead = Math.max(0, Math.min(60, lead));
        Calendar cal = Calendar.getInstance(WIB);
        if (days == null || days.length == 0) {
            if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return -1;
            String[] d = date.split("-");
            cal.clear();
            cal.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]), t[0], t[1], 0);
            long at = cal.getTimeInMillis() - lead * 60000L;
            return at > after ? at : -1;
        }
        boolean[] on = new boolean[8];
        boolean any = false;
        for (int x : days) if (x >= 1 && x <= 7) { on[x] = true; any = true; }
        if (!any) return -1;
        cal.setTimeInMillis(after);
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        cal.set(Calendar.HOUR_OF_DAY, t[0]); cal.set(Calendar.MINUTE, t[1]);
        for (int k = 0; k < 9; k++) {
            long at = cal.getTimeInMillis() - lead * 60000L;
            if (on[cal.get(Calendar.DAY_OF_WEEK)] && at > after) return at;
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }
}
