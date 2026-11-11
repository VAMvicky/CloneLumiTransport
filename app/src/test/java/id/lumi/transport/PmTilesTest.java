package id.lumi.transport;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileOutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

public class PmTilesTest {
    static File fixture() throws Exception {
        URL u = PmTilesTest.class.getClassLoader().getResource("fixture.pmtiles");
        if (u == null) throw new AssertionError("fixture.pmtiles tidak ditemukan");
        return new File(u.toURI());
    }

    static String str(byte[] b) { return b == null ? null : new String(b, StandardCharsets.UTF_8); }

    @Test public void tileIdMatchesReferenceImplementation() {
        // Nilai acuan dari pustaka pmtiles resmi (tools/make_pmtiles_fixture.py)
        assertEquals(0, PmTiles.tileId(0, 0, 0));
        assertEquals(1, PmTiles.tileId(1, 0, 0));
        assertEquals(2, PmTiles.tileId(1, 0, 1));
        assertEquals(3, PmTiles.tileId(1, 1, 1));
        assertEquals(4, PmTiles.tileId(1, 1, 0));
        assertEquals(11, PmTiles.tileId(2, 1, 3));
        assertEquals(1114600L, PmTiles.tileId(10, 813, 520));
        assertEquals(285338398L, PmTiles.tileId(14, 13044, 8333));
        assertEquals(1168746096447L, PmTiles.tileId(20, 834960, 533320));
    }

    @Test(expected = IllegalArgumentException.class)
    public void tileIdRejectsOutOfRange() { PmTiles.tileId(2, 4, 0); }

    @Test public void readsHeaderAndTiles() throws Exception {
        try (PmTiles p = new PmTiles(fixture())) {
            assertEquals(0, p.minZoom);
            assertEquals(6, p.maxZoom);
            assertEquals(106.35, p.minLon, 1e-6);
            assertEquals(-5.95, p.maxLat, 1e-6);
            assertEquals("0/0/0", str(p.tile(0, 0, 0)));
            assertEquals("3/2/5", str(p.tile(3, 2, 5)));
            assertEquals("5/31/0", str(p.tile(5, 31, 0)));
            assertEquals("6/3/9", str(p.tile(6, 3, 9)));
            assertEquals("laut", str(p.tile(6, 2, 9)));      // isi kembar (run length)
            assertEquals("laut", str(p.tile(6, 62, 63)));
            assertNull(p.tile(7, 0, 0));                      // di luar zoom arsip
        }
    }

    @Test public void everyTileInFixtureIsReadable() throws Exception {
        try (PmTiles p = new PmTiles(fixture())) {
            for (int z = 0; z <= 6; z++)
                for (int x = 0; x < (1 << z); x++)
                    for (int y = 0; y < (1 << z); y++) {
                        String want = z == 6 && x % 2 == 0 ? "laut" : z + "/" + x + "/" + y;
                        assertEquals(want, str(p.tile(z, x, y)));
                    }
        }
    }

    @Test public void rejectsNonPmtilesFile() throws Exception {
        File f = File.createTempFile("bukan", ".pmtiles");
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(new byte[200]); }
        try { new PmTiles(f).close(); fail("harus ditolak"); }
        catch (java.io.IOException e) { assertTrue(e.getMessage().contains("PMTiles")); }
        finally { assertTrue(f.delete()); }
    }

    @Test public void varintDecoding() throws Exception {
        java.io.ByteArrayInputStream in = new java.io.ByteArrayInputStream(new byte[]{(byte) 0xAC, 0x02, 0x7F});
        assertEquals(300, PmTiles.varint(in));
        assertEquals(127, PmTiles.varint(in));
    }

    @Test public void directoryOffsetsContinue() throws Exception {
        // 2 entri: offset entri kedua = 0 → lanjut dari (offset + panjang) entri pertama
        byte[] raw = {2, 5, 1, 1, 3, 10, 20, 8, 0};
        PmTiles.Entry[] e = PmTiles.directory(raw);
        assertEquals(5, e[0].tileId); assertEquals(6, e[1].tileId);
        assertEquals(3, e[1].runLength);
        assertEquals(7, e[0].offset); assertEquals(17, e[1].offset);
        assertArrayEquals(new int[]{10, 20}, new int[]{e[0].length, e[1].length});
    }
}
