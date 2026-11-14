package id.lumi.transport;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Perkiraan tiba bus ke halte naik dari SATU pesan feed armada TJ (dipakai BusWatchService, v2.16).
 * Versi Java dari etaTo()/LumiLive.etaFor() di app.js/live.js:
 *  - halte naik dicari lewat ID halte (bila sudah diketahui dari REST TJ), lalu koordinat (≤ 250 m),
 *    lalu nama;
 *  - arah dicek: halte tujuan / halte sesudahnya harus muncul SETELAH halte naik di daftar sisa
 *    perjalanan bus (bus arah sebaliknya diabaikan);
 *  - ETA dari eta_by_parent_stop_id bila ada, kalau tidak dari stops[i].eta (menit).
 */
public final class BusEta {
    private BusEta() { }

    /** Halte naik & halte sesudahnya (penentu arah). Koordinat NaN = tidak diketahui. */
    public static final class Target {
        public String fromId, toId, fromName, toName;
        public double fromLat = Double.NaN, fromLon = Double.NaN, toLat = Double.NaN, toLon = Double.NaN;
    }

    static String key(String s) { return s == null ? "" : s.toLowerCase(java.util.Locale.US).replaceAll("[^a-z0-9]", ""); }

    /**
     * v2.21: token arah pada nama halte ("Pancoran Arah Barat" → "barat"). Dua halte yang namanya
     * hanya beda token arah adalah dua peron berbeda, bukan satu halte.
     */
    static String dirTok(String s) {
        if (s == null) return "";
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("arah\\s+(utara|selatan|timur|barat)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(s);
        if (m.find()) return m.group(1).toLowerCase(java.util.Locale.US);
        m = java.util.regex.Pattern.compile("(utara|selatan|timur|barat)\\s*$",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(s.trim());
        return m.find() ? m.group(1).toLowerCase(java.util.Locale.US) : "";
    }

    /** Peron pasangan: dua-duanya punya token arah, dan tokennya berbeda. */
    static boolean opposite(String a, String b) {
        String x = dirTok(a), y = dirTok(b);
        return !x.isEmpty() && !y.isEmpty() && !x.equals(y);
    }

    /** Nama halte harus sama PERSIS. Dulu `contains()`: "Pancoran" cocok ke kedua arah sekaligus. */
    static boolean nameMatch(String a, String b) {
        String x = key(a), y = key(b);
        return !x.isEmpty() && !y.isEmpty() && x.equals(y);
    }

    /** Untuk headsign: boleh mengandung, tapi hanya bila arahnya tidak bertentangan. */
    static boolean looseMatch(String a, String b) {
        String x = key(a), y = key(b);
        if (x.isEmpty() || y.isEmpty() || opposite(a, b)) return false;
        return x.equals(y) || x.contains(y) || y.contains(x);
    }

    static double km(double la1, double lo1, double la2, double lo2) {
        double r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
        double h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
        return 2 * 6371 * Math.asin(Math.sqrt(h));
    }

    static int byId(JSONArray st, String id, int start) {
        if (id == null || id.isEmpty()) return -1;
        for (int i = Math.max(0, start); i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s != null && (id.equals(s.optString("parent_stop_id")) || id.equals(s.optString("stop_id")))) return i;
        }
        return -1;
    }

    static int nearest(JSONArray st, double lat, double lon, int start, double tolKm) {
        if (Double.isNaN(lat)) return -1;
        int best = -1; double bd = tolKm;
        for (int i = Math.max(0, start); i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s == null || !s.has("latitude")) continue;
            double d = km(lat, lon, s.optDouble("latitude"), s.optDouble("longitude"));
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    static int byName(JSONArray st, String name, int start) {
        if (name == null) return -1;
        for (int i = Math.max(0, start); i < st.length(); i++) {
            JSONObject s = st.optJSONObject(i);
            if (s != null && nameMatch(s.optString("name"), name)) return i;
        }
        return -1;
    }

    /** Kecepatan rata-rata terbaik yang masih masuk akal (km/jam), termasuk lewat tol (v2.18.3). */
    static final double MAX_KMH = 45;

    /**
     * Menit sampai bus tiba di halte naik, atau -1 bila bus ini tidak (lagi) menuju halte itu searah.
     * v2.18.3: ETA yang lebih cepat dari jarak lurus bus→halte pada MAX_KMH dianggap salah cocok
     * (mis. "5 mnt" untuk bus 13 km jauhnya) dan diabaikan.
     */
    public static double minutes(JSONObject msg, Target t) {
        double m = rawMinutes(msg, t);
        if (m < 0) return m;
        double la = msg.optDouble("snap_latitude", Double.NaN), lo = msg.optDouble("snap_longitude", Double.NaN);
        if (Double.isNaN(la) || la == 0) { la = msg.optDouble("latitude", Double.NaN); lo = msg.optDouble("longitude", Double.NaN); }
        if (!Double.isNaN(la) && la != 0 && !Double.isNaN(t.fromLat)) {
            double floor = km(la, lo, t.fromLat, t.fromLon) / MAX_KMH * 60;
            if (m < floor - 0.5) return -1;
        }
        return m;
    }

    static String optName(JSONArray st, int i) {
        JSONObject s = st == null || i < 0 || i >= st.length() ? null : st.optJSONObject(i);
        return s == null ? null : s.optString("name");
    }

    static double rawMinutes(JSONObject msg, Target t) {
        JSONArray st = msg.optJSONArray("stops");
        if (st == null || st.length() == 0) return -1;
        int fi = byId(st, t.fromId, 0);
        // v2.21: toleransi 250 m lebih lebar daripada jarak dua peron (mis. Pancoran ±40 m), jadi
        // peron seberang selalu ikut cocok. 30 m masih cukup untuk galat GPS, tidak untuk menyeberang.
        if (fi < 0) fi = nearest(st, t.fromLat, t.fromLon, 0, 0.03);
        if (fi < 0) fi = byName(st, t.fromName, 0);
        if (fi >= 0 && opposite(optName(st, fi), t.fromName)) fi = -1;   // peron arah berlawanan
        if (fi < 0) return -1;                               // halte sudah dilewati / bukan jalur bus ini
        boolean wantDir = t.toId != null || !Double.isNaN(t.toLat) || t.toName != null;
        if (wantDir) {
            int ti = byId(st, t.toId, fi + 1);
            if (ti < 0) ti = nearest(st, t.toLat, t.toLon, fi + 1, 0.05);
            if (ti >= 0 && opposite(optName(st, ti), t.toName)) ti = -1;
            if (ti < 0) ti = byName(st, t.toName, fi + 1);
            if (ti < 0 && looseMatch(msg.optString("trip_headsign"), t.toName)) ti = fi + 1;
            if (ti < 0) return -1;                           // arah berlawanan
        }
        JSONObject map = msg.optJSONObject("eta_by_parent_stop_id");
        if (map != null && t.fromId != null && map.has(t.fromId)) {
            double m = map.optDouble(t.fromId);
            if (!Double.isNaN(m)) return Math.max(0, m);
        }
        JSONObject s = st.optJSONObject(fi);
        double m = s == null ? Double.NaN : s.optDouble("eta");
        return Double.isNaN(m) ? -1 : Math.max(0, m);
    }

    /** Tingkat peringatan: 1 = ±10 mnt, 2 = ±5, 3 = ±2, 4 = tiba (sama dengan live.js levelFor). */
    public static int level(double m) { return m <= 0 ? 4 : m <= 2 ? 3 : m <= 5 ? 2 : m <= 10 ? 1 : 0; }
}
