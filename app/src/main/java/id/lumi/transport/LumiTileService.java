package id.lumi.transport;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Ubin Quick Settings "Cari rute": satu ketuk membuka Lumi langsung di kolom pencarian.
 */
public class LumiTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile t = getQsTile();
        if (t != null) {
            t.setState(Tile.STATE_INACTIVE);
            t.setLabel(getString(R.string.tile_label));
            if (Build.VERSION.SDK_INT >= 29) t.setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher_foreground));
            t.updateTile();
        }
    }

    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")   // jalur lama hanya untuk Android < 14
    @Override
    public void onClick() {
        super.onClick();
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra("lumi_shortcut", "search");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            PendingIntent pi = PendingIntent.getActivity(this, 0, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startActivityAndCollapse(pi);
        } else {
            startActivityAndCollapse(i);
        }
    }
}
