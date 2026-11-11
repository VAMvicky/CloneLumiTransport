package id.lumi.transport;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Kriptografi "Ikuti perjalananku" (v2.15), Java murni supaya bisa diuji di JVM biasa bersama
 * pendekripsi WebCrypto di docs/ikuti/index.html (tools/test_share.sh).
 *
 * Format pesan: base64url-tanpa-padding( iv[12] ‖ ciphertext ‖ tag[16] ), AES-256-GCM.
 * Kunci 32 byte acak per perjalanan, hanya ada di HP pengirim & di bagian "#k=" tautan.
 */
public final class ShareCrypto {
    private ShareCrypto() { }

    private static final SecureRandom RND = new SecureRandom();

    public static byte[] random(int n) { byte[] b = new byte[n]; RND.nextBytes(b); return b; }

    public static String b64url(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }

    public static byte[] unb64url(String s) { return Base64.getUrlDecoder().decode(s); }

    public static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(Character.forDigit((x >> 4) & 0xF, 16)).append(Character.forDigit(x & 0xF, 16));
        return sb.toString();
    }

    public static String encrypt(byte[] key, String plain) throws Exception {
        byte[] iv = random(12);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = ci.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ct, 0, out, iv.length, ct.length);
        return b64url(out);
    }

    public static String decrypt(byte[] key, String msg) throws Exception {
        byte[] all = unb64url(msg);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, all, 0, 12));
        return new String(ci.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    }
}
