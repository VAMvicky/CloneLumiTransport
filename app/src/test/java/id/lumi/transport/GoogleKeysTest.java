package id.lumi.transport;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Map;

import org.junit.Test;

/** Header penyamaran dan daftar host yang dilayani — dasar seluruh lapisan Google. */
public class GoogleKeysTest {

    @Test public void headersMemuatPaketDanSertifikat() {
        Map<String, String> h = GoogleKeys.headers();
        assertEquals("com.google.android.apps.maps", h.get("X-Android-Package"));
        assertEquals("38918A453D07199354F8B19AF05EC6562CED5788", h.get("X-Android-Cert"));
        assertEquals(2, h.size());
    }

    @Test public void hostGoogleDikenali() {
        assertTrue(GoogleKeys.isGoogleApiHost("maps.googleapis.com"));
        assertTrue(GoogleKeys.isGoogleApiHost("places.googleapis.com"));
        assertTrue(GoogleKeys.isGoogleApiHost("routes.googleapis.com"));
    }

    @Test public void hostLainDitolak() {
        assertFalse(GoogleKeys.isGoogleApiHost("example.com"));
        assertFalse(GoogleKeys.isGoogleApiHost("maps.googleapis.com.evil.test"));
        assertFalse(GoogleKeys.isGoogleApiHost(null));
    }
}
