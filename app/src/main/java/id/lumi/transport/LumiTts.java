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

    static synchronized void speak(final Context ctx, final String text) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            pending = text;
            tts = new TextToSpeech(ctx.getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override public void onInit(int status) {
                    if (status != TextToSpeech.SUCCESS) return;
                    synchronized (LumiTts.class) {
                        applyLang();
                        ready = true;
                        if (pending != null) {
                            String p = pending; pending = null;
                            try { tts.speak(p, TextToSpeech.QUEUE_FLUSH, null, "lumi"); } catch (Exception ignored) { }
                        }
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
