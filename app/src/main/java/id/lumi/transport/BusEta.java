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

    static boolean nameMatch(String a, String b) {
        String x = key(a), y = key(b);
        return !x.isEmpty() && !y.isEmpty() && (x.equals(y) || x.contains(y) || y.contains(x));
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

    /** Menit sampai bus tiba di halte naik, atau -1 bila bus ini tidak (lagi) menuju halte itu searah. */
    public static double minutes(JSONObject msg, Target t) {
        JSONArray st = msg.optJSONArray("stops");
        if (st == null || st.length() == 0) return -1;
        int fi = byId(st, t.fromId, 0);
        if (fi < 0) fi = nearest(st, t.fromLat, t.fromLon, 0, 0.25);
        if (fi < 0) fi = byName(st, t.fromName, 0);
        if (fi < 0) return -1;                               // halte sudah dilewati / bukan jalur bus ini
        boolean wantDir = t.toId != null || !Double.isNaN(t.toLat) || t.toName != null;
        if (wantDir) {
            int ti = byId(st, t.toId, fi + 1);
            if (ti < 0) ti = nearest(st, t.toLat, t.toLon, fi + 1, 0.35);
            if (ti < 0) ti = byName(st, t.toName, fi + 1);
            if (ti < 0 && nameMatch(msg.optString("trip_headsign"), t.toName)) ti = fi + 1;
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
