package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Bagian murni GtfsImporter: jarak, pembulatan 5 desimal, dan pemecahan CSV. */
public class GtfsImporterTest {

    @Test public void havNolUntukTitikSama() {
        assertEquals(0.0, GtfsImporter.hav(-6.2, 106.8, -6.2, 106.8), 1e-9);
    }

    @Test public void havSekitarSatuKiloMeter() {
        double d = GtfsImporter.hav(-6.2, 106.8, -6.209, 106.8);
        assertTrue("jarak 0,009 derajat ≈ 1 km, dapat " + d, d > 900 && d < 1100);
    }

    @Test public void r5MembulatkanLimaDesimal() {
        assertEquals("1.5", GtfsImporter.r5(1.5));
        assertEquals("1.23457", GtfsImporter.r5(1.23456789));
    }

    @Test public void parseCsvMemisahkanKolom() {
        assertEquals(3, GtfsImporter.parseCsv("a,b,c").size());
        assertEquals("b", GtfsImporter.parseCsv("a,b,c").get(1));
    }
}
