# Aturan R8 untuk Lumi Transport.
#
# Aplikasi ini memakai WebView + JavascriptInterface, jadi nama kelas/metode
# yang dipanggil dari JS tidak boleh diobfuskasi atau dihapus.

-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Jembatan "LumiNative" dipanggil dari JavaScript, bukan dari Java.
-keepclassmembers class id.lumi.transport.MainActivity$* {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class id.lumi.transport.MainActivity$Bridge { *; }

# Komponen yang dibuat lewat refleksi oleh Android (manifest, JobScheduler, dsb).
-keep class id.lumi.transport.NavService { *; }
-keep class id.lumi.transport.RouteWatchJob { *; }
-keep class id.lumi.transport.RouteUpdateJob { *; }
-keep class id.lumi.transport.ShareProvider { *; }
# v2.16: penerima alarm pengingat (manifest) dan widget
-keep class id.lumi.transport.Reminders$ReminderReceiver { *; }
-keep class id.lumi.transport.LumiWidgetProvider { *; }
-keep class id.lumi.transport.BusWatchService { *; }
-keep class id.lumi.transport.Disruptions$Job { *; }
# v2.17: widget ETA bus favorit
-keep class id.lumi.transport.EtaWidget { *; }
-keep class id.lumi.transport.EtaWidget$Job { *; }

# Dipakai lintas-thread dan lewat callback native.
-keep class id.lumi.transport.LiveSocket { *; }
-keep class id.lumi.transport.GtfsImporter { *; }
-keep class id.lumi.transport.GuideTracker { *; }

# JSON ada di android.jar tapi sebagian anggota diakses lewat refleksi internal.
-dontwarn org.json.**
