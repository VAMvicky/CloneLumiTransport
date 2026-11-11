package id.lumi.transport;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Widget "Berangkat / Pulang": dua tombol yang membuka Lumi di kolom asal atau tujuan.
 * v2.16: baris atas menampilkan pengingat berangkat terdekat ("⏰ Berangkat 07.05 → Kantor");
 * mengetuknya membuka rute pengingat itu.
 */
public class LumiWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(context));
    }

    static RemoteViews views(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_lumi);
        v.setOnClickPendingIntent(R.id.wgGo, launch(context, "board"));
        v.setOnClickPendingIntent(R.id.wgHome, launch(context, "home"));
        JSONObject next = null;
        try { next = Reminders.nextForWidget(context); } catch (Exception ignored) { }
        if (next != null) {
            Lang.load(context);
            String to = next.optString("to");
            v.setTextViewText(R.id.wgTitle, "⏰ " + Lang.t("Berangkat ", "Leave ") + next.optString("leave").replace(':', '.') + (to.isEmpty() ? "" : " → " + to));
            v.setOnClickPendingIntent(R.id.wgTitle, launch(context, "reminder:" + next.optString("id")));
        } else {
            v.setTextViewText(R.id.wgTitle, context.getString(R.string.widget_title));
            v.setOnClickPendingIntent(R.id.wgTitle, launch(context, "search"));
        }
        return v;
    }

    /** Perbarui semua widget (dipanggil saat pengingat berubah / berbunyi). */
    static void refresh(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(c, LumiWidgetProvider.class));
            if (ids != null && ids.length > 0) for (int id : ids) mgr.updateAppWidget(id, views(c));
        } catch (Exception ignored) { }
    }

    private static PendingIntent launch(Context c, String what) {
        Intent i = new Intent(c, MainActivity.class);
        i.putExtra("lumi_shortcut", what);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, what.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
