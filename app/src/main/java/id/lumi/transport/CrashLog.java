package id.lumi.transport;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * v2.20 — menyimpan stacktrace terakhir di cache supaya pengguna bisa membagikannya.
 * Tanpa ini aplikasi yang dibagikan lewat APK tidak meninggalkan jejak apa pun saat mati.
 */
final class CrashLog {
    private static final String NAME = "crash-last.txt";
    private static final int MAX = 64 * 1024;

    static void install(final Context app) {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                try { write(app, t, e); } catch (Throwable ignored) { }
                if (prev != null) prev.uncaughtException(t, e);
            }
        });
    }

    private static void write(Context c, Thread t, Throwable e) {
        StringWriter sw = new StringWriter();
        sw.write(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
        sw.write("\nLumi " + AppInfo.version() + " · Android " + android.os.Build.VERSION.SDK_INT
                + " · " + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
        sw.write("\nthread " + t.getName() + "\n");
        e.printStackTrace(new PrintWriter(sw));
        byte[] b = sw.toString().getBytes("UTF-8");
        File f = new File(c.getCacheDir(), NAME);
        FileOutputStream o = new FileOutputStream(f);
        try { o.write(b, 0, Math.min(b.length, MAX)); } finally { o.close(); }
    }

    static String read(Context c) {
        File f = new File(c.getCacheDir(), NAME);
        if (!f.isFile() || f.length() == 0) return null;
        try {
            FileInputStream in = new FileInputStream(f);
            byte[] b = new byte[(int) Math.min(f.length(), MAX)];
            int n = in.read(b);
            in.close();
            return n > 0 ? new String(b, 0, n, "UTF-8") : null;
        } catch (Exception e) { return null; }
    }

    static void clear(Context c) {
        File f = new File(c.getCacheDir(), NAME);
        if (f.isFile()) f.delete();
    }

    private CrashLog() { }
}
