package id.lumi.transport;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

public class GuideTrackerTest {
    static final String SPEC = "B\t0\t-6.2459\t106.8712\tCawang\tTJ 9\tPinang Ranti\t0\n" +
            "S\t0\t-6.2502\t106.8736\tCawang Sentral\tTJ 9\tPinang Ranti\t0\n" +
            "A\t0\t-6.2902\t106.8812\tMakasar\tTJ 9\tPinang Ranti\t0\n" +
            "B\t1\t-6.2897\t106.8804\tJl. Pondok Gede\tJAK36\tCililitan\t0\n" +
            "S\t1\t-6.2886\t106.8758\tJalan Dukuh III\tJAK36\tCililitan\t0\n" +
            "S\t1\t-6.2878\t106.8738\tSDN Dukuh\tJAK36\tCililitan\t0\n" +
            "A\t1\t-6.2877\t106.8728\tUP Angkutan Sekolah\tJAK36\tCililitan\t0\n" +
            "D\t2\t-6.2870\t106.8722\tLaundry Alsusco\t\t\t0\n";

    @Before public void indonesian() { Lang.en = false; }

    @Test public void segmentsFollowLegs() {
        GuideTracker g = new GuideTracker(SPEC);
        assertEquals(8, g.size());
        assertArrayEquals(new int[]{3, 4, 1}, g.segmentLengths());
        boolean[] ride = g.segmentIsRide();
        assertTrue(ride[0]); assertTrue(ride[1]); assertTrue(!ride[2]);
        assertEquals(0, g.progress());
    }

    @Test public void fullTripRaisesAlertsInOrder() {
        GuideTracker g = new GuideTracker(SPEC);
        double[][] path = { {-6.2440, 106.8690}, {-6.2458, 106.8711}, {-6.2503, 106.8737}, {-6.2700, 106.8780},
                {-6.2899, 106.8810}, {-6.2897, 106.8805}, {-6.2887, 106.8760}, {-6.2879, 106.8740},
                {-6.2877, 106.8729}, {-6.2870, 106.8722} };
        StringBuilder alerts = new StringBuilder();
        GuideTracker.State s = null;
        for (double[] p : path) {
            s = g.update(p[0], p[1], 15);
            if (s.alert != null) alerts.append(s.alert).append('|');
        }
        assertNotNull(s);
        assertTrue(s.done);
        assertEquals(8, g.progress());
        String a = alerts.toString();
        assertTrue(a, a.contains("Turun sekarang di Makasar"));
        assertTrue(a, a.contains("Siap-siap turun"));
        assertTrue(a, a.indexOf("Makasar") < a.indexOf("UP Angkutan Sekolah"));
    }

    @Test public void waitingAtBoardingStop() {
        GuideTracker g = new GuideTracker(SPEC);
        GuideTracker.State s = g.update(-6.2459, 106.8712, 10);
        assertEquals("wait", s.phase);
        assertEquals(2, s.stopsLeft);
        assertNull(s.alert);
        assertEquals(1, g.progress());
    }

    @Test public void englishText() {
        Lang.en = true;
        GuideTracker g = new GuideTracker(SPEC);
        GuideTracker.State s = g.update(-6.2459, 106.8712, 10);
        assertTrue(s.title, s.title.startsWith("Wait for TJ 9"));
        assertEquals("2 stops", s.text.replaceAll(".*\\((.*)\\)", "$1"));
        Lang.en = false;
    }

    @Test public void jsonEscapes() {
        GuideTracker.State s = new GuideTracker.State();
        s.phase = "walk"; s.title = "Halte \"A\"\n"; s.text = "x\\y";
        String j = GuideTracker.toJson(s);
        assertTrue(j, j.contains("\"title\":\"Halte \\\"A\\\"\\u000a\""));
        assertTrue(j, j.contains("\"text\":\"x\\\\y\""));
        assertTrue(j, j.contains("\"alert\":null"));
    }

    @Test public void distanceFormat() {
        assertEquals("450 m", GuideTracker.fmtM(447));
        assertEquals("1,3 km", GuideTracker.fmtM(1300));
    }
}
