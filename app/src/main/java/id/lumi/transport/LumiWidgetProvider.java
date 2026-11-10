package id.lumi.transport;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Widget "Berangkat / Pulang": dua tombol yang membuka Lumi di kolom asal atau tujuan.
 */
public class LumiWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_lumi);
            v.setOnClickPendingIntent(R.id.wgGo, launch(context, "board"));
            v.setOnClickPendingIntent(R.id.wgHome, launch(context, "home"));
            mgr.updateAppWidget(id, v);
        }
    }

    private PendingIntent launch(Context c, String what) {
        Intent i = new Intent(c, MainActivity.class);
        i.putExtra("lumi_shortcut", what);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, what.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
