package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

/** Pembaca saldo kartu uang elektronik, dengan kartu tiruan (respons APDU direkam). */
public class CardReaderTest {

    /** Kartu tiruan: setiap perintah punya respons hex yang sudah ditentukan. */
    private static CardReader.Channel card(final String[][] rules) {
        return new CardReader.Channel() {
            @Override public byte[] transceive(byte[] cmd) throws IOException {
                String hex = hex(cmd);
                for (String[] r : rules) {
                    if (hex.startsWith(r[0])) return bytes(r[1]);
                }
                return bytes("6D00");
            }
        };
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02X", x));
        return s.toString();
    }

    private static byte[] bytes(String h) {
        byte[] o = new byte[h.length() / 2];
        for (int i = 0; i < o.length; i++) o[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        return o;
    }

    @Test public void mandiriEmoneyMembacaSaldo() throws Exception {
        CardReader.Result r = CardReader.readIsoDep(card(new String[][]{
                {"00A4040008A000000018300001", "9000"},
                {"00B2010400", "000000000000000000000000" + "0001E240" + "9000"}
        }));
        assertNotNull(r);
        assertTrue(r.card.startsWith("Mandiri"));
        assertTrue(r.known);
        assertEquals(123456L, r.balance);
    }

    @Test public void bniTapCashMembacaSaldo() throws Exception {
        CardReader.Result r = CardReader.readIsoDep(card(new String[][]{
                {"00A4040006112233445566", "9000"},
                {"9032030000", "0000" + "0124F8" + "9000"}
        }));
        assertNotNull(r);
        assertTrue(r.card.contains("TapCash"));
        assertEquals(75000L, r.balance);
    }

    @Test public void kartuTidakDikenalTidakMengarangSaldo() throws Exception {
        CardReader.Result r = CardReader.readIsoDep(card(new String[][]{
                {"00A40400", "6A82"}
        }));
        assertTrue(r == null || !r.known || r.balance == 0);
    }
}
