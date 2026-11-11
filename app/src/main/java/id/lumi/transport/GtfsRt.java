package id.lumi.transport;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Dekoder GTFS-Realtime minimal (v2.15) — tanpa pustaka protobuf, Java murni (bisa diuji di JVM biasa:
 * tools/GtfsRtTest.java). Membaca FeedMessage dan mengubahnya menjadi JSON ringkas untuk app.js:
 *
 * {"ts":<detik>, "vehicles":[{id,label,trip,route,dir,lat,lon,bearing,speed,stop,seq,status,occ,occPct,ts}],
 *  "trips":[{trip,route,dir,start,delay,stops:[{seq,stop,arrDelay,depDelay,arr,dep}]}],
 *  "alerts":[{id,routes:[..],stops:[..],cause,effect,severity,start,end,header:{lang:text},desc:{..},url}]}
 *
 * Dipakai untuk posisi kereta langsung (KRL/MRT/LRT) dan info gangguan, bila operator menyediakan
 * feed GTFS-Realtime (URL diatur di data/remote_config.json → rail.realtime). Nomor field mengikuti
 * gtfs-realtime.proto resmi. Field yang tidak dikenal dilewati.
 */
public final class GtfsRt {
    private GtfsRt() { }

    static final int MAX_BYTES = 8 * 1024 * 1024;

    /** Unduh & dekode (dipanggil di thread latar). */
    public static String fetchJson(String url, String userAgent) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", userAgent);
        c.setRequestProperty("Accept", "application/x-protobuf, application/octet-stream");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new java.io.IOException("HTTP " + code);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = in.read(b)) > 0) {
                bo.write(b, 0, n);
                if (bo.size() > MAX_BYTES) throw new java.io.IOException("feed terlalu besar");
            }
            return toJson(bo.toByteArray());
        } finally { c.disconnect(); }
    }

    // ------------------------------------------------------------------ pembaca protobuf
    static final class Reader {
        final byte[] b; int pos; final int end;
        Reader(byte[] b, int off, int end) { this.b = b; this.pos = off; this.end = end; }
        boolean more() { return pos < end; }
        long varint() {
            long r = 0; int shift = 0;
            while (true) {
                if (pos >= end) throw new IllegalArgumentException("varint terpotong");
                int x = b[pos++] & 0xFF;
                r |= (long) (x & 0x7F) << shift;
                if ((x & 0x80) == 0) return r;
                shift += 7;
                if (shift > 63) throw new IllegalArgumentException("varint terlalu panjang");
            }
        }
        int fixed32() {
            if (pos + 4 > end) throw new IllegalArgumentException("fixed32 terpotong");
            int v = (b[pos] & 0xFF) | (b[pos + 1] & 0xFF) << 8 | (b[pos + 2] & 0xFF) << 16 | (b[pos + 3] & 0xFF) << 24;
            pos += 4; return v;
        }
        long fixed64() {
            if (pos + 8 > end) throw new IllegalArgumentException("fixed64 terpotong");
            long v = 0;
            for (int i = 7; i >= 0; i--) v = (v << 8) | (b[pos + i] & 0xFFL);
            pos += 8; return v;
        }
        Reader sub() {
            long len = varint();
            if (len < 0 || pos + len > end) throw new IllegalArgumentException("panjang pesan salah");
            Reader r = new Reader(b, pos, (int) (pos + len));
            pos += (int) len;
            return r;
        }
        String str() { Reader r = sub(); return new String(b, r.pos, r.end - r.pos, StandardCharsets.UTF_8); }
        float f32() { return Float.intBitsToFloat(fixed32()); }
        void skip(int wire) {
            switch (wire) {
                case 0: varint(); break;
                case 1: fixed64(); break;
                case 2: sub(); break;
                case 5: fixed32(); break;
                default: throw new IllegalArgumentException("wire type " + wire);
            }
        }
    }

    // ------------------------------------------------------------------ penulis JSON kecil
    static void q(StringBuilder sb, String s) {
        if (s == null) { sb.append("null"); return; }
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        sb.append('"');
    }
    static void kv(StringBuilder sb, String k, String v) { if (v != null) { comma(sb); q(sb, k); sb.append(':'); q(sb, v); } }
    static void kn(StringBuilder sb, String k, long v) { comma(sb); q(sb, k); sb.append(':').append(v); }
    static void kf(StringBuilder sb, String k, double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return;
        comma(sb); q(sb, k); sb.append(':').append(v);
    }
    static void comma(StringBuilder sb) {
        char c = sb.charAt(sb.length() - 1);
        if (c != '{' && c != '[') sb.append(',');
    }

    // ------------------------------------------------------------------ pesan
    static final class Trip { String id, route, start, date; int dir = -1; }

    static Trip trip(Reader r) {
        Trip t = new Trip();
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) t.id = r.str();
            else if (f == 5 && w == 2) t.route = r.str();
            else if (f == 6 && w == 0) t.dir = (int) r.varint();
            else if (f == 2 && w == 2) t.start = r.str();
            else if (f == 3 && w == 2) t.date = r.str();
            else r.skip(w);
        }
        return t;
    }

    static String[] vehicleDesc(Reader r) {
        String id = null, label = null;
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) id = r.str();
            else if (f == 2 && w == 2) label = r.str();
            else r.skip(w);
        }
        return new String[]{id, label};
    }

    static final String[] STATUS = {"INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"};
    static final String[] OCC = {"EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY",
            "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"};

    static String en(String[] names, long v) { return v >= 0 && v < names.length ? names[(int) v] : String.valueOf(v); }

    static void vehicle(Reader r, StringBuilder sb, String entityId) {
        Trip t = null; String[] vd = null; String stop = null;
        double lat = Double.NaN, lon = Double.NaN, brg = Double.NaN, spd = Double.NaN;
        long seq = -1, status = -1, ts = 0, occ = -1, occPct = -1;
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) t = trip(r.sub());
            else if (f == 8 && w == 2) vd = vehicleDesc(r.sub());
            else if (f == 2 && w == 2) {
                Reader p = r.sub();
                while (p.more()) {
                    long pt = p.varint(); int pf = (int) (pt >>> 3), pw = (int) (pt & 7);
                    if (pf == 1 && pw == 5) lat = p.f32();
                    else if (pf == 2 && pw == 5) lon = p.f32();
                    else if (pf == 3 && pw == 5) brg = p.f32();
                    else if (pf == 5 && pw == 5) spd = p.f32();
                    else p.skip(pw);
                }
            }
            else if (f == 3 && w == 0) seq = r.varint();
            else if (f == 7 && w == 2) stop = r.str();
            else if (f == 4 && w == 0) status = r.varint();
            else if (f == 5 && w == 0) ts = r.varint();
            else if (f == 9 && w == 0) occ = r.varint();
            else if (f == 10 && w == 0) occPct = r.varint();
            else r.skip(w);
        }
        if (Double.isNaN(lat) || Double.isNaN(lon)) return;
        comma(sb); sb.append('{');
        kv(sb, "id", vd != null && vd[0] != null ? vd[0] : entityId);
        if (vd != null) kv(sb, "label", vd[1]);
        if (t != null) { kv(sb, "trip", t.id); kv(sb, "route", t.route); if (t.dir >= 0) kn(sb, "dir", t.dir); }
        kf(sb, "lat", lat); kf(sb, "lon", lon); kf(sb, "bearing", brg); kf(sb, "speed", spd);
        kv(sb, "stop", stop);
        if (seq >= 0) kn(sb, "seq", seq);
        if (status >= 0) kv(sb, "status", en(STATUS, status));
        if (occ >= 0) kv(sb, "occ", en(OCC, occ));
        if (occPct >= 0) kn(sb, "occPct", occPct);
        if (ts > 0) kn(sb, "ts", ts);
        sb.append('}');
    }

    static long[] stopTimeEvent(Reader r) {
        long delay = Long.MIN_VALUE, time = 0;
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 0) delay = (int) r.varint();          // int32 (negatif = lebih awal)
            else if (f == 2 && w == 0) time = r.varint();
            else r.skip(w);
        }
        return new long[]{delay, time};
    }

    static void tripUpdate(Reader r, StringBuilder sb) {
        Trip t = null; long delay = Long.MIN_VALUE;
        StringBuilder stops = new StringBuilder("[");
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) t = trip(r.sub());
            else if (f == 5 && w == 0) delay = (int) r.varint();
            else if (f == 2 && w == 2) {
                Reader s = r.sub();
                long seq = -1; String stop = null; long[] arr = null, dep = null;
                while (s.more()) {
                    long st = s.varint(); int sf = (int) (st >>> 3), sw = (int) (st & 7);
                    if (sf == 1 && sw == 0) seq = s.varint();
                    else if (sf == 4 && sw == 2) stop = s.str();
                    else if (sf == 2 && sw == 2) arr = stopTimeEvent(s.sub());
                    else if (sf == 3 && sw == 2) dep = stopTimeEvent(s.sub());
                    else s.skip(sw);
                }
                comma(stops); stops.append('{');
                if (seq >= 0) kn(stops, "seq", seq);
                kv(stops, "stop", stop);
                if (arr != null && arr[0] != Long.MIN_VALUE) kn(stops, "arrDelay", arr[0]);
                if (dep != null && dep[0] != Long.MIN_VALUE) kn(stops, "depDelay", dep[0]);
                if (arr != null && arr[1] > 0) kn(stops, "arr", arr[1]);
                if (dep != null && dep[1] > 0) kn(stops, "dep", dep[1]);
                stops.append('}');
            }
            else r.skip(w);
        }
        stops.append(']');
        if (t == null) return;
        comma(sb); sb.append('{');
        kv(sb, "trip", t.id); kv(sb, "route", t.route); if (t.dir >= 0) kn(sb, "dir", t.dir);
        kv(sb, "start", t.start); kv(sb, "date", t.date);
        if (delay != Long.MIN_VALUE) kn(sb, "delay", delay);
        comma(sb); q(sb, "stops"); sb.append(':').append(stops);
        sb.append('}');
    }

    static void translated(Reader r, StringBuilder sb, String key) {
        StringBuilder o = new StringBuilder("{");
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) {
                Reader tr = r.sub(); String text = null, lang = null;
                while (tr.more()) {
                    long tt = tr.varint(); int tf = (int) (tt >>> 3), tw = (int) (tt & 7);
                    if (tf == 1 && tw == 2) text = tr.str();
                    else if (tf == 2 && tw == 2) lang = tr.str();
                    else tr.skip(tw);
                }
                if (text != null) kv(o, lang == null || lang.isEmpty() ? "_" : lang, text);
            } else r.skip(w);
        }
        o.append('}');
        comma(sb); q(sb, key); sb.append(':').append(o);
    }

    static final String[] CAUSE = {"", "UNKNOWN_CAUSE", "OTHER_CAUSE", "TECHNICAL_PROBLEM", "STRIKE", "DEMONSTRATION",
            "ACCIDENT", "HOLIDAY", "WEATHER", "MAINTENANCE", "CONSTRUCTION", "POLICE_ACTIVITY", "MEDICAL_EMERGENCY"};
    static final String[] EFFECT = {"", "NO_SERVICE", "REDUCED_SERVICE", "SIGNIFICANT_DELAYS", "DETOUR", "ADDITIONAL_SERVICE",
            "MODIFIED_SERVICE", "OTHER_EFFECT", "UNKNOWN_EFFECT", "STOP_MOVED", "NO_EFFECT", "ACCESSIBILITY_ISSUE"};
    static final String[] SEVERITY = {"", "UNKNOWN_SEVERITY", "INFO", "WARNING", "SEVERE"};

    static void alert(Reader r, StringBuilder sb, String entityId) {
        StringBuilder routes = new StringBuilder("["), stops = new StringBuilder("["), rest = new StringBuilder("{");
        long start = 0, end = 0, cause = -1, effect = -1, sev = -1;
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) {
                Reader tr = r.sub(); long a = 0, b = 0;
                while (tr.more()) {
                    long tt = tr.varint(); int tf = (int) (tt >>> 3), tw = (int) (tt & 7);
                    if (tf == 1 && tw == 0) a = tr.varint(); else if (tf == 2 && tw == 0) b = tr.varint(); else tr.skip(tw);
                }
                if (start == 0 || (a > 0 && a < start)) start = a;
                if (b > end) end = b;
            } else if (f == 5 && w == 2) {
                Reader es = r.sub();
                while (es.more()) {
                    long tt = es.varint(); int tf = (int) (tt >>> 3), tw = (int) (tt & 7);
                    if (tf == 2 && tw == 2) { comma(routes); q(routes, es.str()); }
                    else if (tf == 5 && tw == 2) { comma(stops); q(stops, es.str()); }
                    else if (tf == 4 && tw == 2) { Trip t = trip(es.sub()); if (t.route != null) { comma(routes); q(routes, t.route); } }
                    else es.skip(tw);
                }
            } else if (f == 6 && w == 0) cause = r.varint();
            else if (f == 7 && w == 0) effect = r.varint();
            else if (f == 14 && w == 0) sev = r.varint();
            else if (f == 10 && w == 2) translated(r.sub(), rest, "header");
            else if (f == 11 && w == 2) translated(r.sub(), rest, "desc");
            else if (f == 8 && w == 2) translated(r.sub(), rest, "url");
            else r.skip(w);
        }
        routes.append(']'); stops.append(']'); rest.append('}');
        comma(sb); sb.append('{');
        kv(sb, "id", entityId);
        comma(sb); q(sb, "routes"); sb.append(':').append(routes);
        comma(sb); q(sb, "stops"); sb.append(':').append(stops);
        if (cause > 0) kv(sb, "cause", en(CAUSE, cause));
        if (effect > 0) kv(sb, "effect", en(EFFECT, effect));
        if (sev > 0) kv(sb, "severity", en(SEVERITY, sev));
        if (start > 0) kn(sb, "start", start);
        if (end > 0) kn(sb, "end", end);
        if (rest.length() > 2) { sb.append(',').append(rest, 1, rest.length() - 1); }
        sb.append('}');
    }

    /** FeedMessage (biner) → JSON. Melempar IllegalArgumentException bila datanya rusak. */
    public static String toJson(byte[] data) {
        Reader r = new Reader(data, 0, data.length);
        StringBuilder veh = new StringBuilder("["), trips = new StringBuilder("["), alerts = new StringBuilder("[");
        long ts = 0;
        while (r.more()) {
            long tag = r.varint(); int f = (int) (tag >>> 3), w = (int) (tag & 7);
            if (f == 1 && w == 2) {                                   // FeedHeader
                Reader h = r.sub();
                while (h.more()) {
                    long ht = h.varint(); int hf = (int) (ht >>> 3), hw = (int) (ht & 7);
                    if (hf == 3 && hw == 0) ts = h.varint(); else h.skip(hw);
                }
            } else if (f == 2 && w == 2) {                            // FeedEntity
                Reader e = r.sub();
                String id = null; boolean deleted = false;
                Reader tu = null, vp = null, al = null;
                while (e.more()) {
                    long et = e.varint(); int ef = (int) (et >>> 3), ew = (int) (et & 7);
                    if (ef == 1 && ew == 2) id = e.str();
                    else if (ef == 2 && ew == 0) deleted = e.varint() != 0;
                    else if (ef == 3 && ew == 2) tu = e.sub();
                    else if (ef == 4 && ew == 2) vp = e.sub();
                    else if (ef == 5 && ew == 2) al = e.sub();
                    else e.skip(ew);
                }
                if (deleted) continue;
                if (vp != null) vehicle(vp, veh, id);
                if (tu != null) tripUpdate(tu, trips);
                if (al != null) alert(al, alerts, id);
            } else r.skip(w);
        }
        StringBuilder sb = new StringBuilder("{");
        kn(sb, "ts", ts);
        sb.append(",\"vehicles\":").append(veh).append(']');
        sb.append(",\"trips\":").append(trips).append(']');
        sb.append(",\"alerts\":").append(alerts).append(']');
        return sb.append('}').toString();
    }
}
