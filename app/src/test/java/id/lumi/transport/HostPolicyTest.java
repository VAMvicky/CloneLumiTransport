package id.lumi.transport;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HostPolicyTest {
    @Test public void allowsKnownHttpsHosts() {
        assertTrue(HostPolicy.urlAllowed("https://raw.githubusercontent.com/VAMvicky/LumiTransport/main/data/fares.json"));
        assertTrue(HostPolicy.urlAllowed("https://photon.komoot.io/api/?q=monas"));
        assertTrue(HostPolicy.urlAllowed("https://tijeapi.transjakarta.co.id/v1/auth/login/guest"));
        assertTrue(HostPolicy.urlAllowed("https://ROUTER.project-osrm.org:443/route/v1/driving/1,2;3,4"));
    }

    @Test public void rejectsEverythingElse() {
        assertFalse(HostPolicy.urlAllowed("http://raw.githubusercontent.com/x"));            // bukan HTTPS
        assertFalse(HostPolicy.urlAllowed("https://evil.example/x"));
        assertFalse(HostPolicy.urlAllowed("https://raw.githubusercontent.com.evil.example/x"));
        assertFalse(HostPolicy.urlAllowed("https://user@photon.komoot.io/api"));
        assertFalse(HostPolicy.urlAllowed("https://photon.komoot.io:8443/api"));
        assertFalse(HostPolicy.urlAllowed("file:///data/data/id.lumi.transport/shared_prefs/x.xml"));
        assertFalse(HostPolicy.urlAllowed("https://192.168.1.1/admin"));
        assertFalse(HostPolicy.urlAllowed(null));
        assertFalse(HostPolicy.urlAllowed("::::"));
    }

    @Test public void updateDownloadsOnlyFromLumiReleases() {
        assertTrue(HostPolicy.isGithubDownload("https://github.com/VAMvicky/TransportBCK/releases/download/v2.18.0/LumiTransport-v2.18.0.apk"));
        assertFalse(HostPolicy.isGithubDownload("http://github.com/VAMvicky/TransportBCK/releases/download/v2.18.0/LumiTransport-v2.18.0.apk"));
        assertFalse(HostPolicy.isGithubDownload("https://github.com/someone/else/releases/download/v1/x.apk"));
        assertFalse(HostPolicy.isGithubDownload("https://github.com/VAMvicky/TransportBCK/releases/download/v2.18.0/notes.txt"));
        assertFalse(HostPolicy.isGithubDownload("https://evil.example/VAMvicky/TransportBCK/releases/download/v1/x.apk"));
        assertFalse(HostPolicy.isGithubDownload(null));
    }

    @Test public void headers() {
        assertTrue(HostPolicy.headerAllowed("Accept", "application/json"));
        assertTrue(HostPolicy.headerAllowed("x-app-version", "2.11.0"));
        assertTrue(HostPolicy.headerAllowed("Authorization", "Bearer abc"));
        assertFalse(HostPolicy.headerAllowed("Host", "evil.example"));
        assertFalse(HostPolicy.headerAllowed("Cookie", "a=b"));
        assertFalse(HostPolicy.headerAllowed("x-ok", "a\r\nX-Injected: 1"));
        assertFalse(HostPolicy.headerAllowed(null, "x"));
    }
}
