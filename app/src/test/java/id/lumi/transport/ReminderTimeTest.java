package id.lumi.transport;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Calendar;

import org.junit.Test;

public class ReminderTimeTest {
    /** ms epoch untuk jam dinding WIB. */
    static long wib(int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(ReminderTime.WIB);
        c.clear();
        c.set(y, mo - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    @Test public void parsesClock() {
        assertArrayEquals(new int[]{7, 5}, ReminderTime.hm("07:05"));
        assertArrayEquals(new int[]{0, 0}, ReminderTime.hm("0:00"));
        assertNull(ReminderTime.hm("24:00"));
        assertNull(ReminderTime.hm("7.05"));
        assertNull(ReminderTime.hm(null));
    }

    @Test public void oneOffSubtractsLead() {
        long after = wib(2026, 11, 11, 18, 0);
        assertEquals(wib(2026, 11, 12, 7, 0), ReminderTime.nextFire("07:05", 5, null, "2026-11-12", after));
        assertEquals(-1, ReminderTime.nextFire("07:05", 5, new int[0], "2026-11-10", after));   // sudah lewat
        assertEquals(-1, ReminderTime.nextFire("07:05", 5, null, "besok", after));
    }

    @Test public void weeklyPicksNextSelectedDay() {
        // Rabu 11 Nov 2026 pukul 18.00 WIB; pengingat Senin–Jumat 07:05, 10 menit sebelumnya
        int[] weekdays = {Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY, Calendar.THURSDAY, Calendar.FRIDAY};
        long after = wib(2026, 11, 11, 18, 0);
        assertEquals(wib(2026, 11, 12, 6, 55), ReminderTime.nextFire("07:05", 10, weekdays, null, after));
        // Jumat malam → Senin
        assertEquals(wib(2026, 11, 16, 6, 55), ReminderTime.nextFire("07:05", 10, weekdays, null, wib(2026, 11, 13, 20, 0)));
        // Hari yang sama, belum lewat
        assertEquals(wib(2026, 11, 11, 18, 50), ReminderTime.nextFire("19:00", 10, weekdays, null, after));
    }

    @Test public void leadCrossingMidnightUsesLeaveDay() {
        int[] sat = {Calendar.SATURDAY};
        // Berangkat Sabtu 00:10, ingatkan 30 menit sebelumnya = Jumat 23:40
        assertEquals(wib(2026, 11, 13, 23, 40), ReminderTime.nextFire("00:10", 30, sat, null, wib(2026, 11, 11, 12, 0)));
    }

    @Test public void leadIsClamped() {
        long after = wib(2026, 11, 11, 0, 0);
        assertEquals(wib(2026, 11, 12, 7, 0), ReminderTime.nextFire("08:00", 500, null, "2026-11-12", after));
        assertEquals(wib(2026, 11, 12, 8, 0), ReminderTime.nextFire("08:00", -5, null, "2026-11-12", after));
    }

    @Test public void invalidDaysGiveNoAlarm() {
        assertEquals(-1, ReminderTime.nextFire("08:00", 5, new int[]{0, 9}, null, wib(2026, 11, 11, 0, 0)));
    }
}
