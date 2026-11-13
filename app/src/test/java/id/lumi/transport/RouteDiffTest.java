package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

/** Pembanding indeks rute: dipakai pemberitahuan "rute berubah". */
public class RouteDiffTest {

    private static final String IDX_9 = "R\t9\tBlok M - Kota\t2\nM\t9\t0\tA|B|C\n";
    private static final String IDX_9_BARU = "R\t9\tBlok M - Kota Baru\t2\nM\t9\t0\tA|B|C|D\n";

    @Test public void ruteBaruTerdeteksi() {
        List<RouteDiff.Item> items = RouteDiff.diff("", IDX_9);
        assertEquals(1, items.size());
        assertEquals("add", items.get(0).kind);
        assertEquals("9", items.get(0).code);
    }

    @Test public void namaDanHalteBerubahTerdeteksi() {
        List<RouteDiff.Item> items = RouteDiff.diff(IDX_9, IDX_9_BARU);
        assertEquals(1, items.size());
        assertEquals("chg", items.get(0).kind);
        assertTrue("teks harus menyebut perubahan, dapat: " + items.get(0).text,
                items.get(0).text.contains("Nama trayek") || items.get(0).text.contains("Halte"));
    }

    @Test public void indeksSamaTidakMenghasilkanPerubahan() {
        List<RouteDiff.Item> items = RouteDiff.diff(IDX_9, IDX_9);
        assertEquals(0, items.size());
    }

    @Test public void toJsonMemuatTanggalDanKode() {
        List<RouteDiff.Item> items = RouteDiff.diff("", IDX_9);
        String json = RouteDiff.toJson("2026-11-13", items);
        assertTrue(json.contains("2026-11-13"));
        assertTrue(json.contains("\"9\""));
    }
}
