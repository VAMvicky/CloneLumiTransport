package id.lumi.transport;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bandingkan ringkasan rute lama vs baru (format index dari GtfsImporter). Tanpa ketergantungan Android. */
public class RouteDiff {
    public static class Item {
        public String kind;   // add | del | chg
        public String code, name, text;
        public String oldName;                                   // bila nama trayek berubah
        public List<String> added = new ArrayList<String>(), removed = new ArrayList<String>();
        /** Urutan halte per arah sebelum & sesudah (untuk tampilan "Sebelum / Sesudah"). */
        public Map<String, List<String>> before = new LinkedHashMap<String, List<String>>(), after = new LinkedHashMap<String, List<String>>();
    }

    static class Route {
        String name = ""; int patterns;
        Map<String, List<String>> main = new LinkedHashMap<String, List<String>>();
    }

    static Map<String, Route> parse(String idx) {
        Map<String, Route> m = new LinkedHashMap<String, Route>();
        if (idx == null) return m;
        for (String line : idx.split("\n")) {
            String[] f = line.split("\t", -1);
            if (f.length < 4) continue;
            String code = f[1].trim();
            if (code.isEmpty()) continue;
            Route r = m.get(code);
            if (r == null) { r = new Route(); m.put(code, r); }
            if ("R".equals(f[0])) {
                if (r.name.isEmpty()) r.name = f[2];
                try { r.patterns += Integer.parseInt(f[3].trim()); } catch (NumberFormatException ignored) { }
            } else if ("M".equals(f[0])) {
                String dir = f[2];
                List<String> stops = new ArrayList<String>();
                for (String s : f[3].split("\\|")) if (!s.isEmpty()) stops.add(s);
                List<String> prev = r.main.get(dir);
                if (prev == null || stops.size() > prev.size()) r.main.put(dir, stops);
            }
        }
        return m;
    }

    static String list(Set<String> s, int max) {
        StringBuilder b = new StringBuilder();
        int i = 0;
        for (String x : s) {
            if (i == max) { b.append(" dll. (").append(s.size()).append(")"); break; }
            if (i > 0) b.append(", ");
            b.append(x);
            i++;
        }
        return b.toString();
    }

    public static List<Item> diff(String oldIdx, String newIdx) {
        Map<String, Route> a = parse(oldIdx), b = parse(newIdx);
        List<Item> out = new ArrayList<Item>();
        for (Map.Entry<String, Route> e : b.entrySet()) {
            Route nr = e.getValue(), or = a.get(e.getKey());
            if (or == null) {
                Item it = new Item(); it.kind = "add"; it.code = e.getKey(); it.name = nr.name;
                it.text = "Rute baru: " + nr.name; it.after.putAll(nr.main); out.add(it);
                continue;
            }
            Set<String> oldStops = new LinkedHashSet<String>(), newStops = new LinkedHashSet<String>();
            for (List<String> l : or.main.values()) oldStops.addAll(l);
            for (List<String> l : nr.main.values()) newStops.addAll(l);
            Set<String> added = new LinkedHashSet<String>(newStops); added.removeAll(oldStops);
            Set<String> removed = new LinkedHashSet<String>(oldStops); removed.removeAll(newStops);
            boolean orderChanged = false;
            if (added.isEmpty() && removed.isEmpty()) {
                for (Map.Entry<String, List<String>> d : nr.main.entrySet()) {
                    List<String> o = or.main.get(d.getKey());
                    if (o != null && !o.equals(d.getValue())) { orderChanged = true; break; }
                }
            }
            List<String> parts = new ArrayList<String>();
            if (!nr.name.equals(or.name) && !or.name.isEmpty()) parts.add("Nama trayek: " + or.name + " → " + nr.name);
            if (!added.isEmpty()) parts.add("Halte baru: " + list(added, 4));
            if (!removed.isEmpty()) parts.add("Tidak lagi lewat: " + list(removed, 4));
            if (orderChanged) parts.add("Urutan halte berubah");
            if (nr.patterns != or.patterns && parts.isEmpty())
                parts.add("Pola perjalanan " + (nr.patterns > or.patterns ? "bertambah" : "berkurang") + " (" + or.patterns + " → " + nr.patterns + ", mis. varian lewat tol)");
            if (!parts.isEmpty()) {
                Item it = new Item(); it.kind = "chg"; it.code = e.getKey(); it.name = nr.name;
                if (!nr.name.equals(or.name) && !or.name.isEmpty()) it.oldName = or.name;
                it.added.addAll(added); it.removed.addAll(removed);
                it.before.putAll(or.main); it.after.putAll(nr.main);
                StringBuilder t = new StringBuilder();
                for (int i = 0; i < parts.size(); i++) { if (i > 0) t.append(". "); t.append(parts.get(i)); }
                it.text = t.toString(); out.add(it);
            }
        }
        for (Map.Entry<String, Route> e : a.entrySet()) {
            if (b.containsKey(e.getKey())) continue;
            Item it = new Item(); it.kind = "del"; it.code = e.getKey(); it.name = e.getValue().name;
            it.text = "Rute tidak ada lagi di data resmi"; it.before.putAll(e.getValue().main); out.add(it);
        }
        return out;
    }

    public static String toJson(String date, List<Item> items) {
        StringBuilder sb = new StringBuilder("{\"date\":");
        GuideTracker.esc(sb, date);
        sb.append(",\"items\":[");
        for (int i = 0; i < items.size(); i++) {
            Item it = items.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"k\":"); GuideTracker.esc(sb, it.kind);
            sb.append(",\"code\":"); GuideTracker.esc(sb, it.code);
            sb.append(",\"name\":"); GuideTracker.esc(sb, it.name);
            sb.append(",\"text\":"); GuideTracker.esc(sb, it.text);
            if (it.oldName != null) { sb.append(",\"on\":"); GuideTracker.esc(sb, it.oldName); }
            if (!it.added.isEmpty()) { sb.append(",\"add\":"); arr(sb, it.added); }
            if (!it.removed.isEmpty()) { sb.append(",\"rm\":"); arr(sb, it.removed); }
            if (!it.before.isEmpty() || !it.after.isEmpty()) sb.append(",\"det\":1");
            sb.append('}');
        }
        return sb.append("]}").toString();
    }

    static void arr(StringBuilder sb, List<String> l) {
        sb.append('[');
        for (int i = 0; i < l.size(); i++) { if (i > 0) sb.append(','); GuideTracker.esc(sb, l.get(i)); }
        sb.append(']');
    }
    static void dirs(StringBuilder sb, Map<String, List<String>> m) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<String, List<String>> d : m.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            GuideTracker.esc(sb, d.getKey()); sb.append(':'); arr(sb, d.getValue());
        }
        sb.append('}');
    }
    /** Detail urutan halte sebelum/sesudah per kode rute: {"9":{"b":{"0":[..]},"a":{"0":[..]}}, ...}. */
    public static String detailJson(List<Item> items) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Item it : items) {
            if (it.before.isEmpty() && it.after.isEmpty()) continue;
            if (!first) sb.append(',');
            first = false;
            GuideTracker.esc(sb, it.code);
            sb.append(":{\"b\":"); dirs(sb, it.before);
            sb.append(",\"a\":"); dirs(sb, it.after);
            sb.append('}');
        }
        return sb.append('}').toString();
    }

    public static void main(String[] x) {
        String a = "R\t9\tPinang Ranti - Pluit\t3\nM\t9\t0\tPinang Ranti|Makasar|Cawang|Grogol|Pluit\n" +
                "R\t9H\tCawang - Grogol\t1\nM\t9H\t0\tCawang|Grogol\nR\t7B\tKampung Rambutan - Blok M\t2\nM\t7B\t0\tA|B|C\n";
        String b = "R\t9\tPinang Ranti - Pluit\t4\nM\t9\t0\tPinang Ranti|Makasar|Cawang|Tol|Pluit\n" +
                "R\t7B\tKampung Rambutan - Blok M\t3\nM\t7B\t0\tA|B|C\nR\tJAK108\tKramat Jati - Bambu Apus\t2\nM\tJAK108\t0\tX|Y\n";
        for (Item it : diff(a, b)) System.out.println(it.kind + " " + it.code + ": " + it.text);
        System.out.println(toJson("2026-10-29", diff(a, b)));
        System.out.println(detailJson(diff(a, b)));
    }
}
