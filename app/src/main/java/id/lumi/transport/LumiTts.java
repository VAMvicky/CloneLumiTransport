package id.lumi.transport;

import android.content.Context;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/**
 * Panduan suara untuk layar pendampingan. Inisialisasi TextToSpeech dilakukan
 * sekali; teks yang datang sebelum mesin siap disimpan dan diucapkan setelah siap.
 */
final class LumiTts {
    private static TextToSpeech tts;
    private static boolean ready;
    private static String pending;

    private LumiTts() { }

    /** Diucapkan sekarang (menggantikan antrean): peringatan turun tidak boleh menunggu kalimat sebelumnya. */
    static synchronized void speak(final Context ctx, final String text) {
        try { speakNow(ctx, text); } catch (Throwable e) { tts = null; ready = false; pending = null; }   // v2.18: tak pernah menutup aplikasi
    }

    private static void speakNow(final Context ctx, final String text) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            pending = text;
            tts = new TextToSpeech(ctx.getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override public void onInit(int status) {
                    if (status != TextToSpeech.SUCCESS) return;
                    synchronized (LumiTts.class) {
                      try {
                        applyLang();
                        // v2.17: suara navigasi (menurunkan volume musik sejenak, bukan ikut volume media).
                        try {
                            tts.setAudioAttributes(new android.media.AudioAttributes.Builder()
                                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());
                        } catch (Exception ignored) { }
                        ready = true;
                        if (pending != null) {
                            String p = pending; pending = null;
                            try { tts.speak(p, TextToSpeech.QUEUE_FLUSH, null, "lumi"); } catch (Exception ignored) { }
                        }
                      } catch (Throwable ignored) { }
                    }
                }
            });
            return;
        }
        if (!ready) { pending = text; return; }
        applyLang();
        try { tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lumi"); } catch (Exception ignored) { }
    }

    /** Suara mengikuti bahasa aplikasi (Indonesia / Inggris). */
    private static void applyLang() {
        try { tts.setLanguage(Lang.en ? Locale.US : new Locale("id", "ID")); } catch (Exception ignored) { }
    }

    static synchronized void stop() {
        try { if (tts != null) tts.stop(); } catch (Exception ignored) { }
    }

    static synchronized void shutdown() {
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception ignored) { }
        tts = null; ready = false; pending = null;
    }
}
