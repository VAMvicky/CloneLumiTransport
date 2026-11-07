package id.lumi.transport;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Mengunduh GTFS resmi Transjakarta (file_gtfs.zip) dan meringkasnya menjadi JSON rute + halte
 * yang dipakai Lumi: untuk setiap rute dan arah, diambil pola perjalanan dengan halte terbanyak,
 * lengkap dengan koordinat halte dan bentuk jalur (shape) yang disederhanakan.
 *
 * Hanya memakai java.* agar bisa diuji di JVM biasa (lihat main()).
 */
public class GtfsImporter {
    public static final String GTFS_URL = "https://gtfs.transjakarta.co.id/files/file_gtfs.zip";

    public interface Progress { void update(String message); }

    // ------------------------------------------------------------------ unduh
    public static void download(String url, File dest, Progress p) throws IOException {
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "LumiTransportation/1.5 (Android)");
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                url = new URL(new URL(url), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            if (code != 200) throw new IOException("Server GTFS membalas HTTP " + code);
            long total = c.getContentLength();
            InputStream in = c.getInputStream();
            OutputStream out = new FileOutputStream(dest);
            byte[] buf = new byte[64 * 1024];
            long got = 0, lastReport = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                got += n;
                if (got - lastReport > 512 * 1024) {
                    lastReport = got;
                    p.update("Mengunduh GTFS… " + (got / 1024 / 1024) + (total > 0 ? " / " + (total / 1024 / 1024) : "") + " MB");
                }
            }
            out.close();
            in.close();
            c.disconnect();
            return;
        }
        throw new IOException("Terlalu banyak pengalihan");
    }

    // ------------------------------------------------------------------ CSV
    static List<String> parseCsv(String line) {
        List<String> out = new ArrayList<String>();
        StringBuilder sb = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (q) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') { sb.append('"'); i++; }
                    else q = false;
                } else sb.append(ch);
            } else if (ch == '"') q = true;
            else if (ch == ',') { out.add(sb.toString()); sb.setLength(0); }
            else sb.append(ch);
        }
        out.add(sb.toString());
        return out;
    }

    static class Table {
        BufferedReader r;
        Map<String, Integer> col = new HashMap<String, Integer>();
        List<String> row;

        Table(ZipFile z, String name) throws IOException {
            ZipEntry e = z.getEntry(name);
            if (e == null) {   // beberapa feed menaruh file di dalam folder
                java.util.Enumeration<? extends ZipEntry> en = z.entries();
                while (en.hasMoreElements()) {
                    ZipEntry x = en.nextElement();
                    if (x.getName().endsWith("/" + name)) { e = x; break; }
                }
            }
            if (e == null) throw new IOException(name + " tidak ada di GTFS");
            r = new BufferedReader(new InputStreamReader(z.getInputStream(e), "UTF-8"), 1 << 16);
            String head = r.readLine();
            if (head == null) throw new IOException(name + " kosong");
            if (head.startsWith("﻿")) head = head.substring(1);
            List<String> h = parseCsv(head);
            for (int i = 0; i < h.size(); i++) col.put(h.get(i).trim(), i);
        }

        boolean next() throws IOException {
            String l;
            do { l = r.readLine(); if (l == null) { r.close(); return false; } } while (l.trim().isEmpty());
            row = parseCsv(l);
            return true;
        }

        String get(String name) {
            Integer i = col.get(name);
            if (i == null || i >= row.size()) return "";
            return row.get(i).trim();
        }
    }

    // ------------------------------------------------------------------ ringkas
    static class Pattern {
        String routeId, dir, shapeId, headsign, tripId;
        List<int[]> seqStops = new ArrayList<int[]>();   // [sequence, stopIndex]
    }

    static double hav(double la1, double lo1, double la2, double lo2) {
        double R = 6371000, r = Math.PI / 180;
        double dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
        double h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    static void esc(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(' ');
            else sb.append(c);
        }
        sb.append('"');
    }

    static String r5(double v) { return String.valueOf(Math.round(v * 100000) / 100000.0); }

    public static String summarize(File zipFile, String sourceDate, Progress p) throws IOException {
        return summarize(zipFile, sourceDate, p, null);
    }

    /**
     * index (opsional) diisi ringkasan untuk mendeteksi perubahan rute, satu baris per item:
     *   R\tkode\tnama\tjumlahPola      dan      M\tkode\tarah\thalte1|halte2|…   (pola utama per arah)
     */
    public static String summarize(File zipFile, String sourceDate, Progress p, StringBuilder index) throws IOException {
        ZipFile z = new ZipFile(zipFile);
        try {
            p.update("Membaca daftar rute…");
            Map<String, String[]> routes = new LinkedHashMap<String, String[]>();   // id -> short,long,desc,color,type
            Table t = new Table(z, "routes.txt");
            while (t.next()) {
                routes.put(t.get("route_id"), new String[]{t.get("route_short_name"), t.get("route_long_name"),
                        t.get("route_desc"), t.get("route_color"), t.get("route_type")});
            }

            p.update("Membaca perjalanan…");
            Map<String, Pattern> repByKey = new LinkedHashMap<String, Pattern>();
            Map<String, Pattern> repByTrip = new HashMap<String, Pattern>();
            t = new Table(z, "trips.txt");
            while (t.next()) {
                String rid = t.get("route_id");
                if (!routes.containsKey(rid)) continue;
                String dir = t.get("direction_id");
                String shape = t.get("shape_id");
                String head = t.get("trip_headsign");
                String key = rid + "|" + dir + "|" + (shape.isEmpty() ? head : shape);
                if (repByKey.containsKey(key)) continue;
                Pattern pt = new Pattern();
                pt.routeId = rid; pt.dir = dir.isEmpty() ? "0" : dir; pt.shapeId = shape; pt.headsign = head;
                pt.tripId = t.get("trip_id");
                repByKey.put(key, pt);
                repByTrip.put(pt.tripId, pt);
            }

            p.update("Membaca halte…");
            Map<String, Integer> stopIdx = new HashMap<String, Integer>();
            List<String> stopName = new ArrayList<String>();
            List<double[]> stopPos = new ArrayList<double[]>();
            t = new Table(z, "stops.txt");
            while (t.next()) {
                try {
                    double la = Double.parseDouble(t.get("stop_lat")), lo = Double.parseDouble(t.get("stop_lon"));
                    stopIdx.put(t.get("stop_id"), stopName.size());
                    stopName.add(t.get("stop_name"));
                    stopPos.add(new double[]{la, lo});
                } catch (NumberFormatException ignored) { }
            }

            p.update("Membaca urutan halte…");
            t = new Table(z, "stop_times.txt");
            long rows = 0;
            while (t.next()) {
                if (++rows % 200000 == 0) p.update("Membaca urutan halte… " + (rows / 1000) + " rb baris");
                Pattern pt = repByTrip.get(t.get("trip_id"));
                if (pt == null) continue;
                Integer si = stopIdx.get(t.get("stop_id"));
                if (si == null) continue;
                int seq;
                try { seq = Integer.parseInt(t.get("stop_sequence")); } catch (NumberFormatException e) { seq = pt.seqStops.size(); }
                pt.seqStops.add(new int[]{seq, si});
            }

            // SEMUA pola berbeda per rute & arah disimpan (mis. lewat tol vs tidak). Pola dengan
            // halte terbanyak per arah ditandai sebagai pola utama.
            Map<String, Pattern> best = new LinkedHashMap<String, Pattern>();
            List<Pattern> all = new ArrayList<Pattern>();
            Set<String> seenSeq = new HashSet<String>();
            for (Pattern pt : repByKey.values()) {
                if (pt.seqStops.size() < 2) continue;
                java.util.Collections.sort(pt.seqStops, new java.util.Comparator<int[]>() {
                    public int compare(int[] a, int[] b) { return a[0] - b[0]; }
                });
                StringBuilder sig = new StringBuilder(pt.routeId).append('|');
                for (int[] ss : pt.seqStops) sig.append(stopName.get(ss[1])).append('>');
                if (!seenSeq.add(sig.toString())) continue;
                all.add(pt);
                String k = pt.routeId + "|" + pt.dir;
                Pattern b = best.get(k);
                if (b == null || pt.seqStops.size() > b.seqStops.size()) best.put(k, pt);
            }
            Set<String> mainSet = new HashSet<String>();
            for (Pattern pt : best.values()) mainSet.add(pt.tripId);
            Set<String> needShapes = new HashSet<String>();
            for (Pattern pt : all) if (!pt.shapeId.isEmpty()) needShapes.add(pt.shapeId);

            Map<String, List<double[]>> shapes = new HashMap<String, List<double[]>>();
            try {
                p.update("Membaca bentuk jalur…");
                t = new Table(z, "shapes.txt");
                Map<String, List<double[]>> raw = new HashMap<String, List<double[]>>();
                while (t.next()) {
                    String sid = t.get("shape_id");
                    if (!needShapes.contains(sid)) continue;
                    try {
                        double la = Double.parseDouble(t.get("shape_pt_lat")), lo = Double.parseDouble(t.get("shape_pt_lon"));
                        double sq = Double.parseDouble(t.get("shape_pt_sequence"));
                        List<double[]> l = raw.get(sid);
                        if (l == null) { l = new ArrayList<double[]>(); raw.put(sid, l); }
                        l.add(new double[]{sq, la, lo});
                    } catch (NumberFormatException ignored) { }
                }
                for (Map.Entry<String, List<double[]>> e : raw.entrySet()) {
                    List<double[]> l = e.getValue();
                    java.util.Collections.sort(l, new java.util.Comparator<double[]>() {
                        public int compare(double[] a, double[] b) { return Double.compare(a[0], b[0]); }
                    });
                    List<double[]> s = new ArrayList<double[]>();
                    for (double[] q : l) {
                        if (s.isEmpty() || hav(s.get(s.size() - 1)[0], s.get(s.size() - 1)[1], q[1], q[2]) >= 40) s.add(new double[]{q[1], q[2]});
                    }
                    double[] last = l.get(l.size() - 1);
                    s.add(new double[]{last[1], last[2]});
                    shapes.put(e.getKey(), s);
                }
            } catch (IOException noShapes) { /* shapes.txt opsional */ }

            p.update("Menyusun data rute…");
            Map<String, List<Pattern>> byRoute = new LinkedHashMap<String, List<Pattern>>();
            for (Pattern pt : all) {
                List<Pattern> l = byRoute.get(pt.routeId);
                if (l == null) { l = new ArrayList<Pattern>(); byRoute.put(pt.routeId, l); }
                l.add(pt);
            }
            StringBuilder sb = new StringBuilder(1 << 20);
            sb.append("{\"source\":\"GTFS resmi Transjakarta\",\"date\":");
            esc(sb, sourceDate);
            sb.append(",\"lines\":[");
            boolean firstLine = true;
            int count = 0;
            for (Map.Entry<String, List<Pattern>> e : byRoute.entrySet()) {
                String[] r = routes.get(e.getKey());
                if (!firstLine) sb.append(',');
                firstLine = false;
                count++;
                sb.append("{\"rid\":"); esc(sb, e.getKey());
                sb.append(",\"code\":"); esc(sb, r[0]);
                sb.append(",\"name\":"); esc(sb, r[1]);
                sb.append(",\"desc\":"); esc(sb, r[2]);
                sb.append(",\"color\":"); esc(sb, r[3]);
                sb.append(",\"dirs\":[");
                List<Pattern> pats = e.getValue();
                if (index != null) {
                    index.append("R\t").append(r[0]).append('\t').append(r[1].replace('\t', ' ')).append('\t').append(pats.size()).append('\n');
                    for (Pattern pt : pats) {
                        if (!mainSet.contains(pt.tripId)) continue;
                        index.append("M\t").append(r[0]).append('\t').append(pt.dir).append('\t');
                        String pv = null; boolean f1 = true;
                        for (int[] ss : pt.seqStops) {
                            String nm = stopName.get(ss[1]).replace('|', '/').replace('\t', ' ');
                            if (nm.equals(pv)) continue;
                            pv = nm;
                            if (!f1) index.append('|');
                            f1 = false;
                            index.append(nm);
                        }
                        index.append('\n');
                    }
                }
                final Set<String> mains = mainSet;
                java.util.Collections.sort(pats, new java.util.Comparator<Pattern>() {
                    public int compare(Pattern a, Pattern b) {
                        int ma = mains.contains(a.tripId) ? 0 : 1, mb = mains.contains(b.tripId) ? 0 : 1;
                        if (ma != mb) return ma - mb;
                        return a.dir.compareTo(b.dir);
                    }
                });
                for (int d = 0; d < pats.size(); d++) {
                    Pattern pt = pats.get(d);
                    if (d > 0) sb.append(',');
                    sb.append("{\"h\":"); esc(sb, pt.headsign);
                    sb.append(",\"dir\":"); esc(sb, pt.dir);
                    sb.append(",\"main\":").append(mainSet.contains(pt.tripId) ? "true" : "false");
                    sb.append(",\"s\":[");
                    String prev = null;
                    boolean firstStop = true;
                    for (int[] ss : pt.seqStops) {
                        String nm = stopName.get(ss[1]);
                        if (nm.equals(prev)) continue;
                        prev = nm;
                        double[] pos = stopPos.get(ss[1]);
                        if (!firstStop) sb.append(',');
                        firstStop = false;
                        sb.append("{\"n\":"); esc(sb, nm);
                        sb.append(",\"p\":[").append(r5(pos[0])).append(',').append(r5(pos[1])).append("]}");
                    }
                    sb.append("],\"shape\":");
                    List<double[]> sh = shapes.get(pt.shapeId);
                    if (sh == null) sb.append("null");
                    else {
                        sb.append('[');
                        for (int i = 0; i < sh.size(); i++) {
                            if (i > 0) sb.append(',');
                            sb.append('[').append(r5(sh.get(i)[0])).append(',').append(r5(sh.get(i)[1])).append(']');
                        }
                        sb.append(']');
                    }
                    sb.append('}');
                }
                sb.append("]}");
            }
            sb.append("]}");
            p.update("Selesai: " + count + " rute");
            return sb.toString();
        } finally {
            z.close();
        }
    }

    /** Uji di JVM: java GtfsImporter file_gtfs.zip out.json */
    public static void main(String[] a) throws Exception {
        String json = summarize(new File(a[0]), "uji", new Progress() {
            public void update(String m) { System.out.println(m); }
        });
        OutputStream o = new FileOutputStream(a[1]);
        o.write(json.getBytes("UTF-8"));
        o.close();
        System.out.println("bytes " + json.length());
    }
}
