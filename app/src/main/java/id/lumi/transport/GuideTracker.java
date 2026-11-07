package id.lumi.transport;

import java.util.ArrayList;
import java.util.List;

/**
 * Logika mode pendampingan (tanpa ketergantungan Android, bisa diuji di JVM).
 *
 * Masukan: daftar titik (checkpoint) perjalanan berurutan, satu per baris, kolom dipisah TAB:
 *   jenis  leg  lat  lon  nama  rute  arah  rail
 *   jenis: B = halte naik, S = halte yang dilewati, A = halte turun, D = tujuan akhir
 * Setiap posisi GPS menggeser "kursor" ke titik terakhir yang sudah dicapai, lalu menghasilkan
 * judul/teks untuk notifikasi dan peringatan sekali-bunyi ("Siap-siap turun", "Turun sekarang").
 */
public class GuideTracker {
    public static class Cp {
        char kind; int leg; double lat, lon; String name, line, head; boolean rail;
    }
    public static class State {
        public int cursor;            // indeks titik terakhir yang dicapai (-1 = belum)
        public String phase;          // walk | wait | ride | alight | dest | done
        public String title, text;
        public String alert;          // null bila tidak ada peringatan baru
        public int stopsLeft = -1;    // pemberhentian tersisa sampai turun (fase ride)
        public int metersLeft = -1;   // jarak ke titik tujuan berikutnya (fase jalan)
        public int nextIndex;         // titik berikutnya yang dituju
        public boolean done;
        public double lat, lon, acc;
    }

    private final List<Cp> cps = new ArrayList<Cp>();
    private int cursor = -1;
    private final boolean[] warned;      // "siap-siap turun" per leg sudah dibunyikan
    private final boolean[] alighted;    // "turun sekarang" per leg sudah dibunyikan
    private boolean arrived;
    private State last;

    public GuideTracker(String spec) {
        int maxLeg = 0;
        for (String line : spec.split("\n")) {
            String[] f = line.split("\t", -1);
            if (f.length < 5) continue;
            try {
                Cp c = new Cp();
                c.kind = f[0].charAt(0);
                c.leg = Integer.parseInt(f[1]);
                c.lat = Double.parseDouble(f[2]);
                c.lon = Double.parseDouble(f[3]);
                c.name = f[4];
                c.line = f.length > 5 ? f[5] : "";
                c.head = f.length > 6 ? f[6] : "";
                c.rail = f.length > 7 && "1".equals(f[7]);
                cps.add(c);
                maxLeg = Math.max(maxLeg, c.leg);
            } catch (Exception ignored) { }
        }
        warned = new boolean[maxLeg + 2];
        alighted = new boolean[maxLeg + 2];
    }

    public int size() { return cps.size(); }
    public State last() { return last; }

    static double hav(double la1, double lo1, double la2, double lo2) {
        double R = 6371000, r = Math.PI / 180;
        double dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
        double h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    private int indexOf(char kind, int leg) {
        for (int i = 0; i < cps.size(); i++) if (cps.get(i).kind == kind && cps.get(i).leg == leg) return i;
        return -1;
    }

    private static String plural(int n, String w) { return n + " " + w; }

    public State update(double lat, double lon, double acc) {
        State s = new State();
        s.lat = lat; s.lon = lon; s.acc = acc;
        if (cps.isEmpty()) { s.phase = "done"; s.done = true; s.title = "Rute kosong"; s.text = ""; return last = s; }
        int old = cursor;
        // Geser kursor: cari titik terdekat di depan (maks. 14 titik) yang sudah "dicapai".
        int bestJ = -1; double bestD = Double.MAX_VALUE;
        int from = Math.max(0, cursor);
        for (int j = from; j < Math.min(cps.size(), from + 15); j++) {
            Cp c = cps.get(j);
            // Halte naik dianggap "sampai" hanya bila benar-benar dekat (agar petunjuk jalan kaki tidak berhenti
            // terlalu awal); halte yang dilewati bus boleh lebih longgar karena GPS di kendaraan kurang presisi.
            double thr = c.kind == 'D' ? 50 : c.kind == 'B' ? (c.rail ? 150 : 45) : c.rail ? 220 : 110;
            thr = Math.max(thr, Math.min(acc, c.kind == 'B' || c.kind == 'D' ? 60 : 150));
            double d = hav(lat, lon, c.lat, c.lon);
            if (d <= thr && d < bestD) { bestD = d; bestJ = j; }
        }
        if (bestJ > cursor) cursor = bestJ;
        s.cursor = cursor;

        // Peringatan untuk titik turun yang terlewati/dicapai sejak update sebelumnya.
        for (int k = old + 1; k <= cursor; k++) {
            Cp c = cps.get(k);
            if (c.kind == 'A' && !alighted[c.leg]) {
                alighted[c.leg] = true; warned[c.leg] = true;
                int nb = indexOf('B', c.leg + 1);
                s.alert = "Turun sekarang di " + c.name + (nb >= 0 ? ". Lanjut naik " + cps.get(nb).line + " di " + cps.get(nb).name : "");
            }
            if (c.kind == 'D' && !arrived) { arrived = true; s.alert = "Kamu sudah sampai di " + c.name; }
        }

        int next = Math.min(cursor + 1, cps.size() - 1);
        s.nextIndex = next;
        Cp cur = cursor >= 0 ? cps.get(cursor) : null;
        Cp nx = cps.get(next);

        if (arrived || (cur != null && cur.kind == 'D')) {
            s.phase = "done"; s.done = true;
            s.title = "Sampai tujuan";
            s.text = "Kamu sudah sampai di " + cps.get(cps.size() - 1).name + ". Pendampingan selesai.";
            return last = s;
        }
        if (cur != null && (cur.kind == 'B' || cur.kind == 'S') && cps.get(next).leg == cur.leg && nx.kind != 'B') {
            // Sedang naik (atau menunggu di halte naik).
            int ia = indexOf('A', cur.leg);
            int left = Math.max(0, ia - cursor);
            Cp a = cps.get(ia);
            s.stopsLeft = left;
            if (cur.kind == 'B') {
                s.phase = "wait";
                s.title = "Tunggu " + cur.line + (cur.head.isEmpty() ? "" : " arah " + cur.head);
                s.text = "Di " + cur.name + " · turun di " + a.name + " (" + plural(left, "pemberhentian") + ")";
            } else {
                s.phase = "ride";
                s.title = cur.line + " · " + (left <= 1 ? "turun di pemberhentian berikutnya" : plural(left, "pemberhentian lagi"));
                s.text = "Turun di " + a.name + " · sekarang dekat " + cur.name;
            }
            if (left == 1 && !warned[cur.leg]) {
                warned[cur.leg] = true;
                s.alert = "Siap-siap turun! Pemberhentian berikutnya: " + a.name;
            }
            return last = s;
        }
        // Berjalan (ke halte naik berikutnya atau ke tujuan).
        int target = next;
        while (target < cps.size() - 1 && cps.get(target).kind != 'B' && cps.get(target).kind != 'D') target++;
        Cp t = cps.get(target);
        s.nextIndex = target;
        int m = (int) Math.round(hav(lat, lon, t.lat, t.lon) * 1.25);
        s.metersLeft = m;
        if (t.kind == 'D') {
            s.phase = "walk";
            s.title = "Jalan ke tujuan";
            s.text = "±" + fmtM(m) + " lagi ke " + t.name;
        } else {
            s.phase = cur != null && cur.kind == 'A' ? "alight" : "walk";
            s.title = (s.phase.equals("alight") ? "Pindah: jalan ke " : "Jalan ke ") + t.name;
            s.text = "±" + fmtM(m) + " lagi · naik " + t.line + (t.head.isEmpty() ? "" : " arah " + t.head);
        }
        return last = s;
    }

    static String fmtM(int m) {
        if (m < 1000) return (Math.round(m / 10.0) * 10) + " m";
        return String.format(java.util.Locale.US, "%.1f km", m / 1000.0).replace('.', ',');
    }

    static void esc(StringBuilder sb, String s) {
        if (s == null) { sb.append("null"); return; }
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        sb.append('"');
    }

    public static String toJson(State s) {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"cursor\":").append(s.cursor).append(",\"next\":").append(s.nextIndex);
        sb.append(",\"phase\":"); esc(sb, s.phase);
        sb.append(",\"title\":"); esc(sb, s.title);
        sb.append(",\"text\":"); esc(sb, s.text);
        sb.append(",\"alert\":"); esc(sb, s.alert);
        sb.append(",\"stopsLeft\":").append(s.stopsLeft).append(",\"metersLeft\":").append(s.metersLeft);
        sb.append(",\"done\":").append(s.done);
        sb.append(",\"lat\":").append(s.lat).append(",\"lon\":").append(s.lon).append(",\"acc\":").append(s.acc);
        return sb.append('}').toString();
    }

    /** Uji di JVM: simulasi perjalanan sepanjang titik-titik. */
    public static void main(String[] a) {
        String spec = "B\t0\t-6.2459\t106.8712\tCawang\tTJ 9\tPinang Ranti\t0\n" +
                "S\t0\t-6.2502\t106.8736\tCawang Sentral\tTJ 9\tPinang Ranti\t0\n" +
                "A\t0\t-6.2902\t106.8812\tMakasar\tTJ 9\tPinang Ranti\t0\n" +
                "B\t1\t-6.2897\t106.8804\tJl. Pondok Gede\tJAK36\tCililitan\t0\n" +
                "S\t1\t-6.2886\t106.8758\tJalan Dukuh III\tJAK36\tCililitan\t0\n" +
                "S\t1\t-6.2878\t106.8738\tSDN Dukuh\tJAK36\tCililitan\t0\n" +
                "A\t1\t-6.2877\t106.8728\tUP Angkutan Sekolah\tJAK36\tCililitan\t0\n" +
                "D\t2\t-6.2870\t106.8722\tLaundry Alsusco\t\t\t0\n";
        GuideTracker g = new GuideTracker(spec);
        double[][] path = { {-6.2440, 106.8690}, {-6.2458, 106.8711}, {-6.2480, 106.8725}, {-6.2503, 106.8737},
                {-6.2700, 106.8780}, {-6.2899, 106.8810}, {-6.2897, 106.8805}, {-6.2887, 106.8760}, {-6.2879, 106.8740},
                {-6.2877, 106.8729}, {-6.2873, 106.8725}, {-6.2870, 106.8722} };
        for (double[] p : path) {
            State s = g.update(p[0], p[1], 15);
            System.out.println(s.phase + " | " + s.title + " | " + s.text + (s.alert != null ? "  >>> " + s.alert : ""));
        }
    }
}
