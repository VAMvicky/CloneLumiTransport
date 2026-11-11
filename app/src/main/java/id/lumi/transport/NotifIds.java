package id.lumi.transport;

/**
 * Semua ID notifikasi Lumi di satu tempat (v2.17, B-06).
 *
 * Dulu ID pengingat (7200 + hash % 500) menelan ID cek-awal gangguan (7250–7289) dan notifikasi
 * gangguan rute favorit (7300), sehingga satu notifikasi bisa diam-diam menimpa yang lain.
 * Sekarang tiap jenis punya rentang sendiri yang tidak bertumpuk (diuji di NotifIdsTest).
 */
final class NotifIds {
    private NotifIds() { }

    static final int GUIDE = 7001, GUIDE_ALERT = 7002;
    static final int BUS_ALERT = 7003, BUS_WATCH = 7004;
    static final int ROUTE_UPDATE = 7101;
    static final int OFFLINE_MAP = 7150;

    static final int REMINDER_BASE = 8000, REMINDER_SPAN = 500;      // 8000–8499
    static final int PRECHECK_BASE = 8600, PRECHECK_SPAN = 200;      // 8600–8799
    static final int FAV_DISRUPTION = 8900;

    static int slot(String id, int span) { return id == null ? 0 : Math.floorMod(id.hashCode(), span); }

    /** Notifikasi "waktunya berangkat" untuk satu pengingat. */
    static int reminder(String id) { return REMINDER_BASE + slot(id, REMINDER_SPAN); }

    /** Notifikasi cek gangguan 30 menit sebelum pengingat. */
    static int precheck(String id) { return PRECHECK_BASE + slot(id, PRECHECK_SPAN); }
}
