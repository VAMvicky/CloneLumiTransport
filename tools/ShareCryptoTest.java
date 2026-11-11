import id.lumi.transport.ShareCrypto;

/** Cetak kunci + 3 pesan terenkripsi (dipakai tools/test_share.py untuk menguji penampil ikuti/). */
public class ShareCryptoTest {
    public static void main(String[] a) throws Exception {
        byte[] key = ShareCrypto.random(32);
        long now = System.currentTimeMillis();
        String[] msgs = {
            "{\"v\":1,\"state\":\"start\",\"ts\":" + now + ",\"title\":\"Monas → Blok M\",\"to\":\"Blok M\",\"toLat\":-6.2443,\"toLon\":106.7999}",
            "{\"v\":1,\"state\":\"ride\",\"ts\":" + now + ",\"lat\":-6.2,\"lon\":106.82,\"acc\":12,\"title\":\"TJ 1 · 3 pemberhentian lagi\",\"text\":\"Turun di Blok M\",\"stopsLeft\":3,\"to\":\"Blok M\",\"toLat\":-6.2443,\"toLon\":106.7999}",
            "{\"v\":1,\"state\":\"arrived\",\"ts\":" + now + ",\"lat\":-6.2443,\"lon\":106.7999,\"acc\":8,\"title\":\"Sampai\",\"text\":\"Kamu sudah sampai di Blok M.\",\"stopsLeft\":-1,\"to\":\"Blok M\",\"toLat\":-6.2443,\"toLon\":106.7999}"
        };
        System.out.println(ShareCrypto.b64url(key));
        for (String m : msgs) {
            String c = ShareCrypto.encrypt(key, m);
            if (!ShareCrypto.decrypt(key, c).equals(m)) throw new AssertionError("roundtrip Java gagal");
            System.out.println(c);
        }
        // kunci salah harus gagal (GCM tag)
        boolean threw = false;
        try { ShareCrypto.decrypt(ShareCrypto.random(32), ShareCrypto.encrypt(key, "x")); } catch (Exception e) { threw = true; }
        if (!threw) throw new AssertionError("kunci salah tidak terdeteksi");
    }
}
