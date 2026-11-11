package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class IsoTimeTest {
    @Test public void parsesCommonForms() {
        long t = 1794348000000L;   // 2026-11-11T05:00:00+07:00
        assertEquals(t, IsoTime.parse("2026-11-11T05:00+07:00"));
        assertEquals(t, IsoTime.parse("2026-11-11T05:00:00+07:00"));
        assertEquals(t, IsoTime.parse("2026-11-10T22:00:00Z"));
        assertEquals(t, IsoTime.parse("2026-11-10T22:00:00.123Z") - 0);
    }

    @Test public void emptyAndInvalid() {
        assertEquals(-1, IsoTime.parse(null));
        assertEquals(-1, IsoTime.parse("  "));
        assertEquals(-2, IsoTime.parse("besok pagi"));
        assertEquals(-2, IsoTime.parse("2026-11-11T05:00"));          // tanpa zona
        assertEquals(-2, IsoTime.parse("2026-13-40T05:00:00+07:00"));
    }

    @Test public void activeWindow() {
        long now = IsoTime.parse("2026-11-11T08:00+07:00");
        assertTrue(IsoTime.active("2026-11-11T07:00+07:00", "2026-11-11T09:00+07:00", now));
        assertTrue(IsoTime.active(null, "2026-11-11T09:00+07:00", now));
        assertTrue(IsoTime.active("", "", now));
        assertFalse(IsoTime.active("2026-11-11T09:00+07:00", null, now));
        assertFalse(IsoTime.active(null, "2026-11-11T08:00+07:00", now));
        assertFalse(IsoTime.active("rusak", null, now));
    }
}
