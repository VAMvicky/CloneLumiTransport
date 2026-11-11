package id.lumi.transport;

/** ISO 8601 → ms epoch, tanpa ketergantungan Android (dipakai info gangguan; diuji unit). */
final class IsoTime {
    private IsoTime() { }

    /** -1 = kosong (tanpa batas), -2 = tidak terbaca. Zona wajib (Z atau ±HH:MM); detik & pecahan opsional. */
    static long parse(String s) {
        if (s == null || s.trim().isEmpty()) return -1;
        try {
            String x = s.trim().replaceFirst("Z$", "+00:00");
            if (!x.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?[+-]\\d{2}:\\d{2}")) return -2;
            x = x.replaceFirst("\\.\\d+", "");
            if (x.matches(".*T\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}$")) x = x.replaceFirst("(T\\d{2}:\\d{2})", "$1:00");
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", java.util.Locale.US);
            f.setLenient(false);
            return f.parse(x).getTime();
        } catch (Exception e) { return -2; }
    }

    /** Berlaku pada `now`? Jam yang tidak terbaca → dianggap tidak berlaku (sama dengan app.js). */
    static boolean active(String from, String until, long now) {
        long a = parse(from), b = parse(until);
        if (a == -2 || b == -2) return false;
        return (a < 0 || a <= now) && (b < 0 || b > now);
    }
}
