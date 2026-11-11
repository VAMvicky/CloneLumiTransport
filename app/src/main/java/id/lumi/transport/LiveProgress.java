package id.lumi.transport;

import android.annotation.SuppressLint;
import android.app.Notification;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * Notifikasi progres langsung untuk pendampingan (v2.17).
 *
 * Android 16 (API 36) menambahkan Notification.ProgressStyle ("Live Updates"): batang progres bersegmen
 * dengan titik penanda, tampil menonjol di layar kunci dan status bar. Lumi masih dikompilasi dengan
 * SDK 35, jadi API itu dipanggil lewat refleksi — hanya di perangkat API 36+, dan setiap kegagalan
 * diabaikan (notifikasi tetap memakai batang progres biasa dari Builder.setProgress).
 *
 * Segmen = ruas perjalanan (biru = naik kendaraan, abu-abu = jalan kaki); titik = halte naik/turun.
 */
@SuppressLint({"PrivateApi", "DiscouragedPrivateApi", "SoonBlockedPrivateApi", "BlockedPrivateApi"})
final class LiveProgress {
    private LiveProgress() { }

    static final int RIDE = 0xFF1565D8, WALK = 0xFF9AA8B8, POINT = 0xFF0E9384;

    static void apply(Notification.Builder b, GuideTracker t, GuideTracker.State st, String title) {
        try {
            Class<?> styleC = Class.forName("android.app.Notification$ProgressStyle");
            Class<?> segC = Class.forName("android.app.Notification$ProgressStyle$Segment");
            Class<?> ptC = Class.forName("android.app.Notification$ProgressStyle$Point");
            Object style = styleC.getConstructor().newInstance();

            int[] len = t.segmentLengths();
            boolean[] ride = t.segmentIsRide();
            Constructor<?> segNew = segC.getConstructor(int.class);
            Method segColor = segC.getMethod("setColor", int.class);
            List<Object> segs = new ArrayList<Object>();
            Constructor<?> ptNew = ptC.getConstructor(int.class);
            Method ptColor = ptC.getMethod("setColor", int.class);
            List<Object> pts = new ArrayList<Object>();
            int at = 0;
            for (int i = 0; i < len.length; i++) {
                Object sg = segNew.newInstance(len[i]);
                segColor.invoke(sg, ride[i] ? RIDE : WALK);
                segs.add(sg);
                at += len[i];
                if (i < len.length - 1) { Object p = ptNew.newInstance(at); ptColor.invoke(p, POINT); pts.add(p); }
            }
            styleC.getMethod("setProgressSegments", List.class).invoke(style, segs);
            if (!pts.isEmpty()) styleC.getMethod("setProgressPoints", List.class).invoke(style, pts);
            styleC.getMethod("setStyledByProgress", boolean.class).invoke(style, true);
            styleC.getMethod("setProgress", int.class).invoke(style, t.progress());
            b.setStyle((Notification.Style) style);

            Class<?> bc = Notification.Builder.class;
            try { bc.getMethod("setRequestPromotedOngoing", boolean.class).invoke(b, true); } catch (Throwable ignored) { }
            String chip = chip(st);
            if (chip != null) try { bc.getMethod("setShortCriticalText", String.class).invoke(b, chip); } catch (Throwable ignored) { }
        } catch (Throwable ignored) {
            // Perangkat/ROM tanpa ProgressStyle: batang progres biasa sudah terpasang.
        }
    }

    /** Teks pendek untuk chip status bar: "3 hlt" saat naik, "450 m" saat jalan. */
    static String chip(GuideTracker.State st) {
        if (st == null) return null;
        if (st.stopsLeft >= 0) return st.stopsLeft + Lang.t(" hlt", st.stopsLeft == 1 ? " stop" : " stops");
        if (st.metersLeft >= 0) return GuideTracker.fmtM(st.metersLeft);
        return null;
    }
}
