package id.lumi.transport;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Penyedia file sederhana untuk membagikan gambar rute ke aplikasi lain (WhatsApp, IG, dll.)
 * tanpa izin penyimpanan. Hanya melayani file di cache/share/ dan APK update di cache/update/ (v2.18).
 * content://id.lumi.transport.share/<namafile>.png
 */
public class ShareProvider extends ContentProvider {
    public static final String AUTH = "id.lumi.transport.share";

    static File dir(android.content.Context c) {
        File d = new File(c.getCacheDir(), "share");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** v2.18: APK update di cache/update/ (content://…/update/&lt;nama&gt;.apk). */
    static File updateDir(android.content.Context c) { return new File(c.getCacheDir(), "update"); }

    private static boolean isUpdate(Uri uri) {
        java.util.List<String> p = uri.getPathSegments();
        return p != null && p.size() == 2 && "update".equals(p.get(0));
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) throw new FileNotFoundException("invalid");
        if (isUpdate(uri) && !name.endsWith(".apk")) throw new FileNotFoundException("invalid");
        File f = new File(isUpdate(uri) ? updateDir(getContext()) : dir(getContext()), name);
        if (!f.exists()) throw new FileNotFoundException(name);
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override public String getType(Uri uri) { return isUpdate(uri) ? "application/vnd.android.package-archive" : "image/png"; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
