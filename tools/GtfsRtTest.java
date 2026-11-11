import id.lumi.transport.GtfsRt;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Uji dekoder GTFS-Realtime (app/.../GtfsRt.java) di JVM biasa:
 *   javac -d build/rt app/src/main/java/id/lumi/transport/GtfsRt.java tools/GtfsRtTest.java && java -cp build/rt GtfsRtTest
 * FeedMessage dirakit dengan penyandi protobuf mini di bawah, memakai nomor field gtfs-realtime.proto.
 */
public class GtfsRtTest {
    static int fails = 0;
    static void check(boolean ok, String msg) { System.out.println((ok ? "ok: " : "GAGAL: ") + msg); if (!ok) fails++; }

    /* ---- penyandi protobuf mini ---- */
    static final class Pb {
        final ByteArrayOutputStream o = new ByteArrayOutputStream();
        void varint(long v) { while ((v & ~0x7FL) != 0) { o.write((int) ((v & 0x7F) | 0x80)); v >>>= 7; } o.write((int) v); }
        Pb tag(int f, int w) { varint(((long) f << 3) | w); return this; }
        Pb u(int f, long v) { tag(f, 0); varint(v); return this; }
        Pb s(int f, String v) { byte[] b = v.getBytes(StandardCharsets.UTF_8); tag(f, 2); varint(b.length); o.write(b, 0, b.length); return this; }
        Pb m(int f, Pb sub) { byte[] b = sub.o.toByteArray(); tag(f, 2); varint(b.length); o.write(b, 0, b.length); return this; }
        Pb f32(int f, float v) { tag(f, 5); int x = Float.floatToIntBits(v); for (int i = 0; i < 4; i++) o.write((x >>> (8 * i)) & 0xFF); return this; }
        byte[] bytes() { return o.toByteArray(); }
    }

    public static void main(String[] a) {
        Pb trip = new Pb().s(1, "KA1234").s(5, "BOGOR").u(6, 1).s(2, "07:10:00").s(3, "20261111");
        Pb vehicle = new Pb()
                .m(1, trip)
                .m(8, new Pb().s(1, "K1-04").s(2, "KA 1234"))
                .m(2, new Pb().f32(1, -6.2101f).f32(2, 106.8502f).f32(3, 182.5f).f32(5, 13.2f))
                .u(3, 7).s(7, "MRI").u(4, 2).u(5, 1762822800L).u(9, 3).u(10, 85);
        Pb stu1 = new Pb().u(1, 7).s(4, "MRI").m(2, new Pb().u(1, 180)).m(3, new Pb().u(1, 240).u(2, 1762823040L));
        // delay negatif (int32 disandikan sebagai varint 64-bit dua-komplemen)
        Pb stu2 = new Pb().u(1, 8).s(4, "TEB").m(2, new Pb().u(1, -60L));
        Pb tu = new Pb().m(1, trip).m(2, stu1).m(2, stu2).u(5, 120);
        Pb alert = new Pb()
                .m(1, new Pb().u(1, 1762819200L).u(2, 1762862400L))
                .m(5, new Pb().s(2, "BOGOR"))
                .m(5, new Pb().s(5, "MRI"))
                .u(6, 3).u(7, 3).u(14, 3)
                .m(10, new Pb().m(1, new Pb().s(1, "Gangguan sinyal di \"Manggarai\"").s(2, "id")).m(1, new Pb().s(1, "Signal fault").s(2, "en")))
                .m(11, new Pb().m(1, new Pb().s(1, "Perjalanan KA tertahan\nharap maklum").s(2, "id")));
        Pb feed = new Pb()
                .m(1, new Pb().s(1, "2.0").u(2, 0).u(3, 1762822805L))
                .m(2, new Pb().s(1, "v1").m(4, vehicle))
                .m(2, new Pb().s(1, "t1").m(3, tu))
                .m(2, new Pb().s(1, "a1").m(5, alert))
                .m(2, new Pb().s(1, "gone").u(2, 1).m(4, vehicle))                  // dihapus: dilewati
                .m(2, new Pb().s(1, "nopos").m(4, new Pb().m(1, trip)))             // tanpa posisi: dilewati
                .s(99, "field-baru-yang-tidak-dikenal");

        String js = GtfsRt.toJson(feed.bytes());
        System.out.println(js);
        check(js.startsWith("{\"ts\":1762822805,"), "header.timestamp terbaca");
        check(js.contains("\"vehicles\":[{\"id\":\"K1-04\",\"label\":\"KA 1234\",\"trip\":\"KA1234\",\"route\":\"BOGOR\",\"dir\":1"), "kendaraan: id, label, trip, rute, arah");
        check(js.contains("\"lat\":-6.210") && js.contains("\"lon\":106.85"), "posisi lintang/bujur (float)");
        check(js.contains("\"status\":\"IN_TRANSIT_TO\"") && js.contains("\"occ\":\"STANDING_ROOM_ONLY\"") && js.contains("\"occPct\":85"), "status & okupansi");
        check(count(js, "\"label\":\"KA 1234\"") == 1, "entitas is_deleted & tanpa posisi dilewati");
        check(js.contains("\"delay\":120"), "TripUpdate.delay");
        check(js.contains("{\"seq\":7,\"stop\":\"MRI\",\"arrDelay\":180,\"depDelay\":240,\"dep\":1762823040}"), "StopTimeUpdate MRI");
        check(js.contains("{\"seq\":8,\"stop\":\"TEB\",\"arrDelay\":-60}"), "delay negatif (int32)");
        check(js.contains("\"routes\":[\"BOGOR\"]") && js.contains("\"stops\":[\"MRI\"]"), "alert: rute & stasiun terdampak");
        check(js.contains("\"cause\":\"TECHNICAL_PROBLEM\"") && js.contains("\"effect\":\"SIGNIFICANT_DELAYS\"") && js.contains("\"severity\":\"WARNING\""), "alert: sebab, dampak, tingkat");
        check(js.contains("\"start\":1762819200") && js.contains("\"end\":1762862400"), "alert: periode aktif");
        check(js.contains("\"header\":{\"id\":\"Gangguan sinyal di \\\"Manggarai\\\"\",\"en\":\"Signal fault\"}"), "alert: judul multibahasa + escape kutip");
        check(js.contains("\"desc\":{\"id\":\"Perjalanan KA tertahan\\nharap maklum\"}"), "alert: deskripsi + escape baris baru");

        boolean threw = false;
        try { byte[] b = feed.bytes(); GtfsRt.toJson(java.util.Arrays.copyOf(b, b.length - 7)); } catch (IllegalArgumentException e) { threw = true; }
        check(threw, "feed terpotong → IllegalArgumentException (bukan crash lain)");
        check(GtfsRt.toJson(new byte[0]).equals("{\"ts\":0,\"vehicles\":[],\"trips\":[],\"alerts\":[]}"), "feed kosong");

        if (fails > 0) { System.out.println(fails + " pemeriksaan gagal"); System.exit(1); }
        System.out.println("Semua uji GTFS-Realtime lulus");
    }

    static int count(String s, String sub) { int n = 0, i = 0; while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length(); } return n; }
}
