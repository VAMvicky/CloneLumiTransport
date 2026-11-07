package id.lumi.transport;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Tugas harian: unduh GTFS resmi, perbarui data rute, beri notifikasi bila ada rute yang berubah. */
public class RouteUpdateJob extends JobService {
    private Thread worker;

    @Override
    public boolean onStartJob(final JobParameters params) {
        if (RouteUpdater.freshEnough(this)) return false;   // sudah diperbarui hari ini (mis. dari aplikasi)
        worker = new Thread(new Runnable() {
            @Override public void run() {
                boolean fail = false;
                try {
                    RouteUpdater.run(RouteUpdateJob.this, new GtfsImporter.Progress() {
                        public void update(String m) { }
                    }, true);
                } catch (Throwable e) {
                    fail = true;
                }
                jobFinished(params, fail);
            }
        });
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true;   // coba lagi nanti
    }
}
