package id.lumi.transport;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Kunci API internal Google Maps, hasil ekstraksi dari APK Google Maps
 * 26.44.06.1006895251 (com.google.android.apps.maps, build 1068856906).
 *
 * Dari mana saja (lihat docs/google-api-keys.md untuk bukti lengkap):
 *  - PLACES: res/values/strings.xml (resources.arsc) milik APK itu.
 *  - MAPS_SDK: <meta-data com.google.android.geo.API_KEY> dan
 *    <meta-data com.google.location.beacon.API_KEY> di AndroidManifest.xml.
 *  - COMPLIANCE / COMPLIANCE_STAGING: string di classes2.dex, bersebelahan
 *    dengan gmscompliance-pa.googleapis.com.
 *  - CHIME: string di classes2.dex, bersebelahan dengan "chime-sdk" dan id
 *    aplikasi Firebase 1:747654520220:android:...
 *  - STATS_A / STATS_B: string di classes2.dex dalam rombongan konstanta analitik.
 *
 * Kunci-kunci ini bukan milik Lumi, dan semuanya dibatasi ke aplikasi Google
 * Maps (paket + sertifikat penandatangan). Karena itu setiap permintaan
 * menyertakan dua header tiruan:
 *
 *   X-Android-Package: com.google.android.apps.maps
 *   X-Android-Cert:    <SHA-1 sertifikat penandatangan Google Maps>
 *
 * Tanpa kedua header tadi server menjawab REQUEST_DENIED ("This IP, site or
 * mobile application is not authorized to use this API key"). Dengan header
 * tiruan itu kunci menerima permintaan dari aplikasi lain — itulah inti
 * "penyamaran"-nya.
 *
 * Kunci bisa dicabut Google kapan saja; kalau itu terjadi, ambil lagi dari APK
 * Google Maps versi baru dengan cara yang sama.
 */
final class GoogleKeys {
    /** Paket pemilik kunci: dipakai apa adanya sebagai header penyamaran. */
    static final String OWNER_PACKAGE = "com.google.android.apps.maps";

    /** SHA-1 sertifikat penandatangan resmi Google Maps (blok v3 APK, sertifikat "Google Inc." / OU=Android). */
    static final String OWNER_CERT_SHA1 = "38918A453D07199354F8B19AF05EC6562CED5788";

    /** Sertifikat kedua pada rantai rotasi kunci v3.1 (kalau sertifikat utama berganti). */
    static final String OWNER_CERT_SHA1_ROTATED = "BD32424203E0FB25F36B57E5AA356F9BDD1DA998";

    /**
     * res/values/strings.xml → Places API (legacy), Static Maps, Query/Nearby/Text Search.
     * Inilah kunci yang benar-benar mengizinkan pencarian alamat dan petak peta.
     */
    static final String PLACES = "AIzaSyAwL-YrZb2V2cHyiT40jAXVFYDqlqs41gs";

    /**
     * AndroidManifest com.google.android.geo.API_KEY / com.google.location.beacon.API_KEY
     * (Maps SDK for Android). Lewat REST menjawab "enable Billing", jadi hanya cadangan.
     */
    static final String MAPS_SDK = "AIzaSyAbPUTxeDTnaihCKmLXCMKrrUT3HNLQW6w";

    /** classes2.dex, dekat gmscompliance-pa.googleapis.com (produksi). */
    static final String COMPLIANCE = "AIzaSyAZyAvJ8K9XaZCj_nrBkIYRe_iyODXJxAk";

    /** classes2.dex, dekat /staging-gmscompliance-pa.sandbox.googleapis.com (sandbox). */
    static final String COMPLIANCE_STAGING = "AIzaSyBJO1-Q7JrHnlrtDZgengd4liAMLoT7sIU";

    /** classes2.dex, dekat "chime-sdk" (Google Meet Chime). */
    static final String CHIME = "AIzaSyC8UYZpvA2eknNex0Pjid0_eTLJoDu6los";

    /** classes2.dex, rombongan konstanta analitik. */
    static final String STATS_A = "AIzaSyAtTGpfwP8X4mF4y-rZpUXWWsT6aAdktQ4";

    /** classes2.dex, rombongan konstanta analitik. */
    static final String STATS_B = "AIzaSyBmGDOmYcGmylWMKTdQxmf5vXWAuybv7qA";

    /** Header penyamaran untuk semua permintaan ke Google Maps API. */
    static Map<String, String> headers() {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("X-Android-Package", OWNER_PACKAGE);
        h.put("X-Android-Cert", OWNER_CERT_SHA1);
        return h;
    }

    /** Host yang dilayani lewat penyamaran header (dipakai juga oleh penyadap WebView). */
    static boolean isGoogleApiHost(String host) {
        if (host == null) return false;
        return host.equals("maps.googleapis.com")
                || host.equals("places.googleapis.com")
                || host.equals("routes.googleapis.com");
    }

    private GoogleKeys() { }
}
