package id.lumi.transport;

import android.app.job.JobParameters;
import android.app.job.JobService;

/**
 * Tugas harian LAMA (sampai v2.14). Sejak v2.15 pembaruan data rute hanya lewat RouteWatchJob
 * (tiap jam, dengan penjaga unduhan bersama di RouteUpdater.runGuarded) supaya GTFS penuh tidak
 * pernah diunduh dua kali berdekatan oleh dua tugas yang tumpang tindih.
 *
 * Kelas ini tetap terdaftar di manifest hanya agar tugas lama yang masih tersimpan di JobScheduler
 * (dijadwalkan versi sebelumnya, persisted) tidak menunjuk ke komponen yang hilang. Bila terpicu,
 * ia membatalkan dirinya sendiri dan memastikan pemantau tiap jam terjadwal, tanpa mengunduh apa pun.
 */
public class RouteUpdateJob extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        try { RouteUpdater.schedule(this); } catch (Exception ignored) { }
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return false; }
}
