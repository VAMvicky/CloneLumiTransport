package id.lumi.transport;

import java.io.IOException;

/**
 * Cek saldo kartu uang elektronik lewat NFC (v2.16, eksperimental). Java murni (diuji di JVM:
 * tools/CardReaderTest.java); bagian Android (IsoDep/NfcF) ada di MainActivity.
 *
 * Perintah APDU mengikuti proyek sumber terbuka OSP KUE Reader (Apache-2.0,
 * https://github.com/muhakmal/osp-kue-reader), ditulis ulang di sini — lihat NOTICE. Hanya MEMBACA saldo
 * yang memang bisa dibaca tanpa kunci bank; tidak ada penulisan/top-up. Saldo di chip bisa berbeda dengan
 * aplikasi bank bila ada transaksi yang belum disinkronkan.
 *
 * Kartu: Mandiri e-money, BNI TapCash, BRI Brizzi, BCA Flazz (generasi 2), JakCard (Bank DKI),
 * dan kartu FeliCa (mis. KMT KRL lama) lewat NfcF.
 */
public final class CardReader {
    private CardReader() { }

    /** Saluran APDU (IsoDep.transceive / NfcF.transceive), bisa dipalsukan saat pengujian. */
    public interface Channel { byte[] transceive(byte[] cmd) throws IOException; }

    public static final class Result {
        public final String card; public final long balance; public final boolean known;
        Result(String card, long balance, boolean known) { this.card = card; this.balance = balance; this.known = known; }
        public String toJson() {
            StringBuilder sb = new StringBuilder("{\"card\":");
            sb.append('"').append(card.replace("\"", "")).append('"');
            sb.append(",\"known\":").append(known);
            if (known) sb.append(",\"balance\":").append(balance);
            return sb.append('}').toString();
        }
    }

    static final long MAX_PLAUSIBLE = 20_000_000L;   // batas saldo e-money (Rp20 juta)

    static boolean sw(byte[] r, int a, int b) {
        return r != null && r.length >= 2 && (r[r.length - 2] & 0xFF) == a && (r[r.length - 1] & 0xFF) == b;
    }
    static boolean ok(byte[] r) { return sw(r, 0x90, 0x00); }
    static int payload(byte[] r) { return r == null ? 0 : Math.max(0, r.length - 2); }

    static long le32(byte[] b, int o) { return (b[o] & 0xFFL) | (b[o + 1] & 0xFFL) << 8 | (b[o + 2] & 0xFFL) << 16 | (b[o + 3] & 0xFFL) << 24; }
    static long be32(byte[] b, int o) { return (b[o] & 0xFFL) << 24 | (b[o + 1] & 0xFFL) << 16 | (b[o + 2] & 0xFFL) << 8 | (b[o + 3] & 0xFFL); }
    static long be24(byte[] b, int o) { return (b[o] & 0xFFL) << 16 | (b[o + 1] & 0xFFL) << 8 | (b[o + 2] & 0xFFL); }

    static byte[] b(int... v) { byte[] o = new byte[v.length]; for (int i = 0; i < v.length; i++) o[i] = (byte) v[i]; return o; }

    static boolean select(Channel ch, byte[] aid) {
        byte[] cmd = new byte[aid.length + 6];
        cmd[0] = 0x00; cmd[1] = (byte) 0xA4; cmd[2] = 0x04; cmd[3] = 0x00; cmd[4] = (byte) aid.length;
        System.arraycopy(aid, 0, cmd, 5, aid.length);
        cmd[cmd.length - 1] = 0x00;
        try { return ok(ch.transceive(cmd)); } catch (IOException e) { return false; }
    }

    static Result plausible(String card, long bal) {
        if (bal < 0 || bal > MAX_PLAUSIBLE) return new Result(card, 0, false);
        return new Result(card, bal, true);
    }

    // ---------------------------------------------------------------- kartu
    static Result mandiri(Channel ch) throws IOException {
        if (!select(ch, b(0xA0, 0x00, 0x00, 0x00, 0x18, 0x30, 0x00, 0x01)) && !select(ch, b(0, 0, 0, 0, 0, 0, 0, 1))) return null;
        byte[] r = ch.transceive(b(0x00, 0xB2, 0x01, 0x04, 0x00));               // catatan 1, SFI 4
        if (ok(r) && payload(r) >= 16) return plausible("Mandiri e-money", be32(r, 12));
        r = ch.transceive(b(0x00, 0xB5, 0x00, 0x00, 0x0A));                     // saldo langsung (little-endian)
        if (ok(r) && payload(r) >= 4) return plausible("Mandiri e-money", le32(r, 0));
        return new Result("Mandiri e-money", 0, false);
    }

    static Result tapcash(Channel ch) throws IOException {
        if (!select(ch, b(0x11, 0x22, 0x33, 0x44, 0x55, 0x66))) return null;
        byte[] r = ch.transceive(b(0x90, 0x32, 0x03, 0x00, 0x00));
        if (ok(r) && r.length >= 5) return plausible("BNI TapCash", be24(r, 2));
        return new Result("BNI TapCash", 0, false);
    }

    static Result brizzi(Channel ch) throws IOException {
        byte[] r = ch.transceive(b(0x90, 0x5A, 0x00, 0x00, 0x03, 0x01, 0x00, 0x00, 0x00));   // DESFire select app 010000
        if (!sw(r, 0x91, 0x00) && !ok(r)) return null;
        r = ch.transceive(b(0x90, 0x6C, 0x00, 0x00, 0x01, 0x00, 0x00));                         // GetValue file 0
        if (sw(r, 0x91, 0x00) && payload(r) >= 4) return plausible("BRI Brizzi", le32(r, 0));
        return new Result("BRI Brizzi", 0, false);
    }

    static Result flazz(Channel ch) throws IOException {
        if (select(ch, b(0xA0, 0x00, 0x00, 0x00, 0x18, 0x0F, 0x00, 0x00, 0x01, 0x80, 0x01))) {
            byte[] r = ch.transceive(b(0x00, 0xA4, 0x01, 0x00, 0x02, 0x02, 0x00));
            if (ok(r)) {
                r = ch.transceive(b(0x00, 0xB0, 0x81, 0x00, 0x8E));
                if (ok(r)) {
                    r = ch.transceive(b(0x80, 0x32, 0x00, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00));
                    if (r != null && r.length >= 5) return plausible("BCA Flazz", be24(r, 1));
                }
            }
            return new Result("BCA Flazz", 0, false);
        }
        if (select(ch, b(0xA0, 0x00, 0x00, 0x00, 0x03, 0x86, 0x98, 0x07, 0x01))) return new Result("BCA Flazz (generasi lama)", 0, false);
        return null;
    }

    static Result jakcard(Channel ch) throws IOException {
        if (!select(ch, b(0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x53, 0x48, 0x30, 0x31, 0x01, 0x01))) return null;
        byte[] r = ch.transceive(b(0x90, 0x4C, 0x00, 0x00, 0x04));
        if (ok(r) && r.length >= 6) return plausible("JakCard (Bank DKI)", be32(r, 0));
        return new Result("JakCard (Bank DKI)", 0, false);
    }

    /** Kartu ISO-DEP (ISO 14443-4): coba tiap penerbit bergantian. null = tidak dikenali. */
    public static Result readIsoDep(Channel ch) {
        try { Result r = mandiri(ch); if (r != null) return r; } catch (IOException ignored) { }
        try { Result r = tapcash(ch); if (r != null) return r; } catch (IOException ignored) { }
        try { Result r = brizzi(ch); if (r != null) return r; } catch (IOException ignored) { }
        try { Result r = flazz(ch); if (r != null) return r; } catch (IOException ignored) { }
        try { Result r = jakcard(ch); if (r != null) return r; } catch (IOException ignored) { }
        return null;
    }

    /** Kartu FeliCa (NfcF), mis. KMT: layanan 0x090F, blok 0 = transaksi terakhir, saldo di byte 10–11 (LE). */
    public static Result readFelica(byte[] idm, Channel ch) {
        try {
            int n = 1, size = 14 + n * 2;
            byte[] cmd = new byte[size];
            cmd[0] = (byte) size; cmd[1] = 0x06;
            System.arraycopy(idm, 0, cmd, 2, 8);
            cmd[10] = 1; cmd[11] = 0x0F; cmd[12] = 0x09; cmd[13] = (byte) n;
            cmd[14] = (byte) 0x80; cmd[15] = 0;
            byte[] r = ch.transceive(cmd);
            if (r != null && r.length >= 13 + 16 && r[10] == 0 && r[11] == 0 && (r[12] & 0xFF) >= 1) {
                long bal = (r[13 + 10] & 0xFFL) | (r[13 + 11] & 0xFFL) << 8;
                return plausible("FeliCa (KMT)", bal);
            }
            return new Result("Kartu FeliCa", 0, false);
        } catch (IOException e) { return null; }
    }
}
