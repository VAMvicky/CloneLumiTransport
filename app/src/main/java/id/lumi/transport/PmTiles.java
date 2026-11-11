package id.lumi.transport;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * Pembaca arsip PMTiles v3 (satu berkas berisi semua petak peta vektor) tanpa ketergantungan Android
 * (v2.17, peta offline Jabodetabek). Hanya fitur yang dipakai Lumi: header, direktori akar & daun
 * (kompresi gzip/tanpa), dan petak gzip/tanpa. Spesifikasi: github.com/protomaps/PMTiles/blob/main/spec/v3.
 */
final class PmTiles implements Closeable {
    static final int COMP_NONE = 1, COMP_GZIP = 2;

    final RandomAccessFile f;
    final long rootOff, rootLen, leafOff, dataOff;
    final int internalComp, tileComp, tileType, minZoom, maxZoom;
    final double minLon, minLat, maxLon, maxLat;
    private final Entry[] root;
    private final LeafCache leaves = new LeafCache();

    /** LRU kecil untuk direktori daun (nama kelas sendiri agar "Entry" tidak tertukar dengan LinkedHashMap.Entry). */
    static final class LeafCache extends LinkedHashMap<Long, PmTiles.Entry[]> {
        LeafCache() { super(32, 0.75f, true); }
        @Override protected boolean removeEldestEntry(Map.Entry<Long, PmTiles.Entry[]> e) { return size() > 64; }
    }

    static final class Entry {
        long tileId, offset; int length, runLength;
    }

    PmTiles(File file) throws IOException {
        f = new RandomAccessFile(file, "r");
        try {
            byte[] h = read(0, 127);
            if (h[0] != 'P' || h[1] != 'M' || h[2] != 'T' || h[3] != 'i' || h[4] != 'l' || h[5] != 'e' || h[6] != 's')
                throw new IOException("bukan berkas PMTiles");
            if (h[7] != 3) throw new IOException("PMTiles versi " + h[7] + " tidak didukung");
            rootOff = u64(h, 8); rootLen = u64(h, 16);
            leafOff = u64(h, 40); dataOff = u64(h, 56);
            internalComp = h[97]; tileComp = h[98]; tileType = h[99];
            minZoom = h[100] & 0xFF; maxZoom = h[101] & 0xFF;
            minLon = i32(h, 102) / 1e7; minLat = i32(h, 106) / 1e7;
            maxLon = i32(h, 110) / 1e7; maxLat = i32(h, 114) / 1e7;
            if (internalComp != COMP_NONE && internalComp != COMP_GZIP) throw new IOException("kompresi direktori tidak didukung");
            if (rootLen <= 0 || rootLen > 16 * 1024 * 1024) throw new IOException("direktori akar tidak sah");
            root = directory(decompress(read(rootOff, (int) rootLen), internalComp));
        } catch (IOException e) {
            f.close();
            throw e;
        }
    }

    // ------------------------------------------------------------------ angka
    static long u64(byte[] b, int o) {
        long v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | (b[o + i] & 0xFF);
        return v;
    }

    static int i32(byte[] b, int o) {
        return (b[o] & 0xFF) | ((b[o + 1] & 0xFF) << 8) | ((b[o + 2] & 0xFF) << 16) | ((b[o + 3] & 0xFF) << 24);
    }

    static long varint(InputStream in) throws IOException {
        long v = 0; int shift = 0, b;
        do {
            b = in.read();
            if (b < 0) throw new IOException("varint terpotong");
            if (shift > 63) throw new IOException("varint terlalu panjang");
            v |= (long) (b & 0x7F) << shift;
            shift += 7;
        } while ((b & 0x80) != 0);
        return v;
    }

    /** z/x/y → tileId PMTiles (kurva Hilbert per tingkat zoom). */
    static long tileId(int z, long x, long y) {
        if (z < 0 || z > 26) throw new IllegalArgumentException("zoom");
        long n = 1L << z;
        if (x < 0 || y < 0 || x >= n || y >= n) throw new IllegalArgumentException("x/y");
        long acc = ((1L << (2 * z)) - 1) / 3;
        long d = 0;
        for (long s = n / 2; s > 0; s /= 2) {
            long rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
            d += s * s * ((3 * rx) ^ ry);
            if (ry == 0) {
                if (rx == 1) { x = s - 1 - x; y = s - 1 - y; }
                long t = x; x = y; y = t;
            }
        }
        return acc + d;
    }

    // ------------------------------------------------------------------ baca
    private synchronized byte[] read(long off, int len) throws IOException {
        if (len < 0 || len > 64 * 1024 * 1024) throw new IOException("panjang tidak sah");
        byte[] b = new byte[len];
        f.seek(off);
        f.readFully(b);
        return b;
    }

    static byte[] decompress(byte[] b, int comp) throws IOException {
        if (comp == COMP_NONE || comp == 0) return b;
        if (comp != COMP_GZIP) throw new IOException("kompresi " + comp + " tidak didukung");
        try (InputStream in = new GZIPInputStream(new ByteArrayInputStream(b))) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(b.length * 3);
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 64 * 1024 * 1024) throw new IOException("data terlalu besar");
            }
            return out.toByteArray();
        }
    }

    static Entry[] directory(byte[] raw) throws IOException {
        InputStream in = new ByteArrayInputStream(raw);
        long n = varint(in);
        if (n < 0 || n > 10_000_000) throw new IOException("direktori tidak sah");
        Entry[] e = new Entry[(int) n];
        long last = 0;
        for (int i = 0; i < n; i++) { e[i] = new Entry(); last += varint(in); e[i].tileId = last; }
        for (int i = 0; i < n; i++) e[i].runLength = (int) varint(in);
        for (int i = 0; i < n; i++) e[i].length = (int) varint(in);
        for (int i = 0; i < n; i++) {
            long v = varint(in);
            if (v == 0 && i > 0) e[i].offset = e[i - 1].offset + e[i - 1].length;
            else e[i].offset = v - 1;
        }
        return e;
    }

    /** Entri dengan tileId terbesar ≤ id (atau null). */
    static Entry find(Entry[] dir, long id) {
        int lo = 0, hi = dir.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            long c = dir[mid].tileId;
            if (c < id) lo = mid + 1;
            else if (c > id) hi = mid - 1;
            else return dir[mid];
        }
        if (hi >= 0) {
            Entry e = dir[hi];
            if (e.runLength == 0) return e;                 // direktori daun: dicek pemanggil
            if (id - e.tileId < e.runLength) return e;
        }
        return null;
    }

    /** Isi petak (sudah dibuka dari gzip), atau null bila tidak ada di arsip. */
    byte[] tile(int z, long x, long y) throws IOException {
        if (z < minZoom || z > maxZoom) return null;
        long id = tileId(z, x, y);
        Entry[] dir = root;
        for (int depth = 0; depth < 4; depth++) {
            Entry e = find(dir, id);
            if (e == null) return null;
            if (e.runLength > 0) return decompress(read(dataOff + e.offset, e.length), tileComp);
            long key = leafOff + e.offset;
            Entry[] leaf;
            synchronized (leaves) { leaf = leaves.get(key); }
            if (leaf == null) {
                leaf = directory(decompress(read(key, e.length), internalComp));
                synchronized (leaves) { leaves.put(key, leaf); }
            }
            dir = leaf;
        }
        return null;
    }

    @Override public void close() throws IOException { f.close(); }
}
