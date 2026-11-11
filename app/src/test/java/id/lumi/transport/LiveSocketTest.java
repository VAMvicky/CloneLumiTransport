package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import org.junit.Test;

public class LiveSocketTest {
    @Test public void shortAndExtendedLengths() throws Exception {
        assertEquals(5, LiveSocket.payloadLength(new ByteArrayInputStream(new byte[0]), 0x85));
        assertEquals(300, LiveSocket.payloadLength(new ByteArrayInputStream(new byte[]{1, 44}), 126));
        assertEquals(70000, LiveSocket.payloadLength(new ByteArrayInputStream(new byte[]{0, 0, 0, 0, 0, 1, 0x11, 0x70}), 127));
    }

    @Test public void eofInsideHeaderIsAnError() {
        try {
            LiveSocket.payloadLength(new ByteArrayInputStream(new byte[]{1}), 126);
            fail("EOF harus menjadi IOException (dulu terbaca 255)");
        } catch (IOException expected) { }
    }

    @Test public void normalisesRouteCodes() {
        assertEquals("JAK36", LiveSocket.norm("jak.36"));
        assertEquals("9C", LiveSocket.norm("9 C"));
        assertEquals("", LiveSocket.norm(null));
    }
}
