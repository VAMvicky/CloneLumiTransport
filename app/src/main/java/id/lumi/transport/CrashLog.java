package id.lumi.transport;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Catatan crash terakhir di sisi Android (R5). Dipasang sekali per proses; isinya ikut terlampir
 * saat pengguna memilih Pengaturan → Laporkan masalah. Tidak berisi data pribadi (hanya jejak tumpukan).
 */
final class CrashLog {
    private static final String FILE = "last-crash.txt";
    private static boolean installed;

    private CrashLog() { }

    static synchronized void install(Context ctx) {
        if (installed) return;
        installed = true;
        final Context app = ctx.getApplicationContext();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                try {
                    StringWriter sw = new StringWriter();
                    e.printStackTrace(new PrintWriter(sw));
                    String s = sw.toString();
                    if (s.length() > 4000) s = s.substring(0, 4000);
                    String head = "versi " + version(app) + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") · "
                            + Build.MANUFACTURER + " " + Build.MODEL + " · thread " + t.getName() + " · " + System.currentTimeMillis() + "\n";
                    try (FileOutputStream o = new FileOutputStream(new File(app.getFilesDir(), FILE))) {
                        o.write((head + s).getBytes(StandardCharsets.UTF_8));
                    }
                } catch (Throwable ignored) { }
                if (prev != null) prev.uncaughtException(t, e);
            }
        });
    }

    /** Isi crash terakhir, atau "" bila tidak ada. */
    static String read(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), FILE);
            if (!f.exists()) return "";
            return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }

    static void clear(Context ctx) {
        //noinspection ResultOfMethodCallIgnored
        new File(ctx.getFilesDir(), FILE).delete();
    }

    private static String version(Context c) {
        return AppInfo.version();
    }
}
