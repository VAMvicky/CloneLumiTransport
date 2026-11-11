package id.lumi.transport;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

public class NotifIdsTest {
    @Test public void rangesDoNotOverlap() {
        Set<Integer> fixed = new HashSet<Integer>();
        int[] singles = {NotifIds.GUIDE, NotifIds.GUIDE_ALERT, NotifIds.BUS_ALERT, NotifIds.BUS_WATCH,
                NotifIds.ROUTE_UPDATE, NotifIds.OFFLINE_MAP, NotifIds.FAV_DISRUPTION};
        for (int x : singles) assertTrue("ID kembar " + x, fixed.add(x));
        for (int i = 0; i < 2000; i++) {
            String id = "rem" + i + "-" + (i * 7919);
            int r = NotifIds.reminder(id), p = NotifIds.precheck(id);
            assertTrue(r >= NotifIds.REMINDER_BASE && r < NotifIds.REMINDER_BASE + NotifIds.REMINDER_SPAN);
            assertTrue(p >= NotifIds.PRECHECK_BASE && p < NotifIds.PRECHECK_BASE + NotifIds.PRECHECK_SPAN);
            assertFalse(fixed.contains(r));
            assertFalse(fixed.contains(p));
            assertTrue(r != p);
        }
    }

    @Test public void negativeHashStaysInRange() {
        // "polygenelubricants".hashCode() == Integer.MIN_VALUE: Math.abs akan tetap negatif
        int r = NotifIds.reminder("polygenelubricants");
        assertTrue(r >= NotifIds.REMINDER_BASE && r < NotifIds.REMINDER_BASE + NotifIds.REMINDER_SPAN);
    }
}
