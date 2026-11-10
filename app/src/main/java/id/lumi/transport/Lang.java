package id.lumi.transport;

import android.content.Context;

/**
 * Bahasa teks native (notifikasi, pendampingan, suara, pesan galat).
 * Pilihan bahasa disimpan halaman lewat LumiNative.setLang(); bagian native yang berjalan
 * tanpa halaman (layanan, job) memanggil load() lebih dulu.
 */
final class Lang {
    static volatile boolean en;
    private static volatile boolean loaded;

    private Lang() { }

    static void load(Context ctx) {
        if (ctx == null) return;
        try {
            String v = ctx.getSharedPreferences("lumi", Context.MODE_PRIVATE).getString("lang", null);
            if (v == null) v = java.util.Locale.getDefault().getLanguage().equals("in") || java.util.Locale.getDefault().getLanguage().equals("id") ? "id" : "en";
            en = "en".equals(v);
            loaded = true;
        } catch (Exception ignored) { }
    }

    static void ensure(Context ctx) { if (!loaded) load(ctx); }

    static void set(Context ctx, String lang) {
        en = "en".equals(lang);
        loaded = true;
        try { ctx.getSharedPreferences("lumi", Context.MODE_PRIVATE).edit().putString("lang", en ? "en" : "id").apply(); } catch (Exception ignored) { }
    }

    /** Teks sesuai bahasa aktif. */
    static String t(String id, String english) { return en ? english : id; }

    /** Ringkasan perubahan rute (disimpan dalam bahasa Indonesia oleh RouteDiff) untuk ditampilkan. */
    static String diff(String s) {
        if (!en || s == null) return s;
        return s.replace("Rute baru: ", "New route: ")
                .replace("Nama trayek: ", "Route name: ")
                .replace("Halte baru: ", "New stops: ")
                .replace("Tidak lagi lewat: ", "No longer stops at: ")
                .replace("Urutan halte berubah", "Stop order changed")
                .replace("Pola perjalanan bertambah", "More trip patterns")
                .replace("Pola perjalanan berkurang", "Fewer trip patterns")
                .replace(", mis. varian lewat tol)", ", e.g. toll-road variants)")
                .replace("Rute tidak ada lagi di data resmi", "Route no longer in the official data")
                .replace(" dll. (", " etc. (")
                .replace(" dll.", " etc.");
    }
}
