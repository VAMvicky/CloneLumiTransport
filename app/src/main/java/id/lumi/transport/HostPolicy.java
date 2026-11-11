package id.lumi.transport;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Daftar izin untuk permintaan HTTP yang diminta halaman lewat jembatan native (v2.17, B-11).
 *
 * Jembatan LumiNative.http/httpH/httpPost berjalan di luar CORS WebView. Tanpa daftar izin, satu
 * celah XSS bisa memakai aplikasi sebagai proxy ke host mana pun. Hanya HTTPS ke layanan yang memang
 * dipakai Lumi yang diteruskan, dan hanya header yang dikenal.
 */
final class HostPolicy {
    private HostPolicy() { }

    static final Set<String> HOSTS = new HashSet<String>(Arrays.asList(
            "raw.githubusercontent.com",      // data jarak jauh (tarif, gangguan, koreksi halte)
            "api.github.com",                 // cek versi terbaru
            "photon.komoot.io",               // saran alamat OpenStreetMap
            "router.project-osrm.org",        // jarak jalan / rute jalan kaki
            "routing.openstreetmap.de",
            "tijeapi.transjakarta.co.id",     // halte & ETA Transjakarta
            "maps.googleapis.com",            // saran alamat Google (lihat GoogleKeys)
            "places.googleapis.com"
    ));

    static boolean urlAllowed(String url) {
        if (url == null) return false;
        try {
            URI u = new URI(url);
            if (!"https".equalsIgnoreCase(u.getScheme())) return false;
            if (u.getUserInfo() != null) return false;
            if (u.getPort() != -1 && u.getPort() != 443) return false;
            String h = u.getHost();
            return h != null && HOSTS.contains(h.toLowerCase(Locale.US));
        } catch (Exception e) { return false; }
    }

    /** Unduhan APK update: hanya aset rilis GitHub repo Lumi (v2.18). */
    static boolean isGithubDownload(String url) {
        try {
            URI u = new URI(url);
            return "https".equalsIgnoreCase(u.getScheme()) && "github.com".equalsIgnoreCase(u.getHost())
                    && u.getPath() != null && u.getPath().matches("/VAMvicky/(TransportBCK|LumiTransport)/releases/download/[^/]+/[^/]+\\.apk");
        } catch (Exception e) { return false; }
    }

    static boolean headerAllowed(String name, String value) {
        if (name == null || value == null) return false;
        if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.length() > 4096) return false;
        String n = name.toLowerCase(Locale.US);
        return n.equals("accept") || n.equals("accept-language") || n.equals("content-type") || n.equals("authorization")
                || n.matches("x-[a-z0-9-]{1,40}");
    }
}
