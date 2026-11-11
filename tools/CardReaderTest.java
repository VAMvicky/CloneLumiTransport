import id.lumi.transport.CardReader;

import java.util.HashMap;
import java.util.Map;

/**
 * Uji pembaca saldo kartu (CardReader.java) dengan kartu tiruan: respons APDU direkam per perintah.
 *   javac -d build/card app/src/main/java/id/lumi/transport/CardReader.java tools/CardReaderTest.java && java -cp build/card CardReaderTest
 */
public class CardReaderTest {
    static int fails = 0;
    static void check(boolean ok, String m) { System.out.println((ok ? "ok: " : "GAGAL: ") + m); if (!ok) fails++; }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02X", x)); return s.toString(); }
    static byte[] unhex(String h) { byte[] o = new byte[h.length() / 2]; for (int i = 0; i < o.length; i++) o[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16); return o; }

    /** Kartu tiruan: perintah (awalan heksa) → respons; selain itu 6A82 (file tidak ada). */
    static CardReader.Channel card(String... rules) {
        final Map<String, String> m = new HashMap<String, String>();
        for (int i = 0; i < rules.length; i += 2) m.put(rules[i], rules[i + 1]);
        return cmd -> {
            String h = hex(cmd);
            for (Map.Entry<String, String> e : m.entrySet()) if (h.startsWith(e.getKey())) return unhex(e.getValue());
            return unhex("6A82");
        };
    }

    public static void main(String[] a) {
        CardReader.Result r;
        // Mandiri: catatan 1 → saldo big-endian di byte 12..15 (Rp 123.456 = 0x0001E240)
        r = CardReader.readIsoDep(card("00A4040008A000000018300001", "9000", "00B2010400", "000000000000000000000000" + "0001E240" + "9000"));
        check(r != null && r.card.startsWith("Mandiri") && r.known && r.balance == 123456, "Mandiri e-money (catatan 1): " + (r == null ? null : r.toJson()));
        // Mandiri cadangan 00B5: little-endian (Rp 50.000 = 50C30000)
        r = CardReader.readIsoDep(card("00A40400080000000000000001", "9000", "00B500000A", "50C30000" + "000000000000" + "9000"));
        check(r != null && r.balance == 50000, "Mandiri e-money (00B5, little-endian): " + (r == null ? null : r.toJson()));
        // TapCash: byte 2..4 big-endian (Rp 75.000 = 0x0124F8)
        r = CardReader.readIsoDep(card("00A4040006112233445566", "9000", "9032030000", "0000" + "0124F8" + "9000"));
        check(r != null && r.card.contains("TapCash") && r.balance == 75000, "BNI TapCash: " + (r == null ? null : r.toJson()));
        // Brizzi (DESFire): status 9100, nilai little-endian (Rp 20.000 = 204E0000)
        r = CardReader.readIsoDep(card("905A00000301000000", "9100", "906C0000010000", "204E0000" + "9100"));
        check(r != null && r.card.contains("Brizzi") && r.balance == 20000, "BRI Brizzi: " + (r == null ? null : r.toJson()));
        // Flazz gen 2: byte 1..3 big-endian (Rp 10.500 = 0x002904)
        r = CardReader.readIsoDep(card("00A404000BA0000000180F0000018001", "9000", "00A40100020200", "9000", "00B081008E", "00009000",
                "803200030400000000", "00" + "002904" + "9000"));
        check(r != null && r.card.contains("Flazz") && r.balance == 10500, "BCA Flazz: " + (r == null ? null : r.toJson()));
        // JakCard: byte 0..3 big-endian (Rp 15.000 = 0x00003A98)
        r = CardReader.readIsoDep(card("00A404000E315449432E4943415348303101", "9000", "904C000004", "00003A98" + "9000"));
        check(r != null && r.card.contains("JakCard") && r.balance == 15000, "JakCard: " + (r == null ? null : r.toJson()));
        // Kartu tak dikenal
        check(CardReader.readIsoDep(card()) == null, "kartu tak dikenal → null");
        // Saldo tidak masuk akal (> Rp20 juta) → tidak ditampilkan sebagai angka
        r = CardReader.readIsoDep(card("00A40400080000000000000001", "9000", "00B500000A", "FFFFFF7F" + "9000"));
        check(r != null && !r.known, "saldo mustahil ditandai tidak diketahui");
        // FeliCa: blok 0, saldo LE di byte 10..11 (Rp 8.500 = 0x2134 → 34 21)
        byte[] idm = unhex("0102030405060708");
        String resp = "1D07" + "0102030405060708" + "0000" + "01" + "00000000000000000000" + "3421" + "00000000";
        r = CardReader.readFelica(idm, cmd -> unhex(resp));
        check(r != null && r.known && r.balance == 8500, "FeliCa (KMT): " + (r == null ? null : r.toJson()));
        if (fails > 0) { System.out.println(fails + " gagal"); System.exit(1); }
        System.out.println("Semua uji pembaca saldo kartu lulus");
    }
}
