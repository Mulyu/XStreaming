package com.xstreaming;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * The resizable "recently played" home-screen widget: the most recently launched
 * games as icon tiles, one per launcher cell (a 2x2 widget shows four, a 4x3 one
 * twelve); unused slots stay empty, and a tap on a tile relaunches that game
 * straight into its stream through the same intent a pinned shortcut uses.
 *
 * The list is pushed from JS (HomeWidgetModule) whenever a game is launched and
 * kept in SharedPreferences, so the widget keeps working with the app process
 * dead. Artwork is downloaded by the app at that moment and cached as small
 * files, because a widget cannot load URLs itself.
 *
 * The whole grid is drawn into one bitmap so tile size, corner radius and gap
 * can follow the launcher's own icon grid exactly (measured from a real home
 * screen, in units of the icon size s: gap 0.38 s, corner radius 0.24 s, a
 * 0.033 s margin around the block), independent of the launcher's cell size.
 * The block is centred in whatever size the widget has been resized to.
 */
final class RecentTitlesWidget {
    // The largest grid the widget can be resized to (see the provider info's
    // maxResize*), and so how many recent games are worth keeping.
    static final int MAX_COLS = 5;
    static final int MAX_ROWS = 6;
    static final int MAX_ITEMS = MAX_COLS * MAX_ROWS;

    private static final String PREFS = "anystreaming_recent_widget";
    private static final String KEY_ITEMS = "items";
    private static final String KEY_PLACEHOLDER = "placeholder";
    private static final String ICON_DIR = "widget_icons";
    private static final int ICON_PX = 256;
    private static final int DEFAULT_SIDE_DP = 110;
    private static final int MAX_BITMAP_PX = 1200;

    // Geometry relative to the icon size s: a block of n tiles is
    // (n + (n - 1) * GAP + 2 * MARGIN) * s wide.
    private static final float GAP = 0.38f;
    private static final float MARGIN = 0.033f;
    private static final float RADIUS = 0.24f;

    // The launcher's grid: a widget of n cells is 70 * n - 30 dp.
    private static final float CELL_DP = 70f;
    private static final float CELL_INSET_DP = 30f;

    private static final int[] ROW_IDS = {
            R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2,
            R.id.widget_row_3, R.id.widget_row_4, R.id.widget_row_5};
    private static final int[] TILE_IDS = {
            R.id.widget_tile_0, R.id.widget_tile_1, R.id.widget_tile_2, R.id.widget_tile_3,
            R.id.widget_tile_4, R.id.widget_tile_5, R.id.widget_tile_6, R.id.widget_tile_7,
            R.id.widget_tile_8, R.id.widget_tile_9, R.id.widget_tile_10, R.id.widget_tile_11,
            R.id.widget_tile_12, R.id.widget_tile_13, R.id.widget_tile_14, R.id.widget_tile_15,
            R.id.widget_tile_16, R.id.widget_tile_17, R.id.widget_tile_18, R.id.widget_tile_19,
            R.id.widget_tile_20, R.id.widget_tile_21, R.id.widget_tile_22, R.id.widget_tile_23,
            R.id.widget_tile_24, R.id.widget_tile_25, R.id.widget_tile_26, R.id.widget_tile_27,
            R.id.widget_tile_28, R.id.widget_tile_29};

    /** How many launcher cells a widget dimension of {@code dp} spans, within 1..max. */
    static int cellsFor(float dp, int max) {
        int cells = Math.round((dp + CELL_INSET_DP) / CELL_DP);
        return Math.max(1, Math.min(cells, max));
    }

    /** Width of a block of {@code n} tiles, in units of the tile size. */
    static float blockUnits(int n) {
        return n + (n - 1) * GAP + 2f * MARGIN;
    }

    private RecentTitlesWidget() {}

    // ---- Stored state ----------------------------------------------------

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context context, JSONArray items, int placeholderColor) {
        JSONArray capped = new JSONArray();
        for (int i = 0; i < items.length() && i < MAX_ITEMS; i++) {
            capped.put(items.opt(i));
        }
        prefs(context).edit()
                .putString(KEY_ITEMS, capped.toString())
                .putInt(KEY_PLACEHOLDER, placeholderColor)
                .apply();
    }

    private static JSONArray load(Context context) {
        String raw = prefs(context).getString(KEY_ITEMS, null);
        if (raw == null) {
            return new JSONArray();
        }
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // ---- Artwork cache ---------------------------------------------------

    private static File iconFile(Context context, String iconUrl) {
        File dir = new File(context.getFilesDir(), ICON_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return new File(dir, Integer.toHexString(iconUrl.hashCode()) + ".png");
    }

    /** Downloads artwork for every item that has none cached; true if any was fetched. */
    static boolean ensureIcons(Context context, JSONArray items) {
        boolean fetched = false;
        for (int i = 0; i < items.length() && i < MAX_ITEMS; i++) {
            JSONObject item = items.optJSONObject(i);
            String url = item == null ? "" : item.optString("iconUrl", "");
            if (TextUtils.isEmpty(url)) {
                continue;
            }
            File file = iconFile(context, url);
            if (file.exists()) {
                continue;
            }
            Bitmap square = downloadSquare(url);
            if (square == null) {
                continue;
            }
            try (FileOutputStream out = new FileOutputStream(file)) {
                square.compress(Bitmap.CompressFormat.PNG, 100, out);
                fetched = true;
            } catch (Exception ignored) {
                file.delete();
            } finally {
                square.recycle();
            }
        }
        return fetched;
    }

    /** Deletes cached artwork no item refers to any more. */
    static void pruneIcons(Context context, JSONArray items) {
        Set<String> keep = new HashSet<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            String url = item == null ? "" : item.optString("iconUrl", "");
            if (!TextUtils.isEmpty(url)) {
                keep.add(iconFile(context, url).getName());
            }
        }
        File[] files = new File(context.getFilesDir(), ICON_DIR).listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (!keep.contains(file.getName())) {
                file.delete();
            }
        }
    }

    private static Bitmap downloadSquare(String iconUrl) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(iconUrl).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(true);
            connection.connect();
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            Bitmap source;
            try (InputStream input = connection.getInputStream()) {
                source = BitmapFactory.decodeStream(input);
            }
            if (source == null) {
                return null;
            }
            int size = Math.min(source.getWidth(), source.getHeight());
            Bitmap cropped = Bitmap.createBitmap(
                    source, (source.getWidth() - size) / 2, (source.getHeight() - size) / 2, size, size);
            Bitmap scaled = Bitmap.createScaledBitmap(cropped, ICON_PX, ICON_PX, true);
            if (cropped != source) {
                source.recycle();
            }
            if (scaled != cropped) {
                cropped.recycle();
            }
            return scaled;
        } catch (Throwable t) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    // ---- Updating the widget --------------------------------------------

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, RecentTitlesWidgetProvider.class));
        for (int id : ids) {
            update(context, manager, id);
        }
    }

    static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        JSONArray items = load(context);
        int placeholder = prefs(context).getInt(KEY_PLACEHOLDER, Color.parseColor("#6C7597"));

        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        // The size the launcher currently gives the widget: the width/height
        // pair that belongs to the device's orientation.
        boolean landscape = context.getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        int widthDp = options.getInt(
                landscape ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                        : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,
                DEFAULT_SIDE_DP);
        int heightDp = options.getInt(
                landscape ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
                        : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,
                DEFAULT_SIDE_DP);
        widthDp = Math.max(widthDp, 40);
        heightDp = Math.max(heightDp, 40);
        float density = context.getResources().getDisplayMetrics().density;

        int cols = cellsFor(widthDp, MAX_COLS);
        int rows = cellsFor(heightDp, MAX_ROWS);

        // The art is drawn at the widget's own pixel size (capped), the tiles
        // as big as fit the grid, and the block centred.
        float viewW = widthDp * density;
        float viewH = heightDp * density;
        float scale = Math.min(1f, MAX_BITMAP_PX / Math.max(viewW, viewH));
        int bitmapW = Math.max(64, Math.round(viewW * scale));
        int bitmapH = Math.max(64, Math.round(viewH * scale));

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_recent_titles);
        views.setImageViewBitmap(
                R.id.widget_art, render(context, items, placeholder, bitmapW, bitmapH, cols, rows));

        // Click targets: only the used rows and columns, padded to the block
        // the art occupies.
        float tile = Math.min(viewW / blockUnits(cols), viewH / blockUnits(rows));
        int padX = Math.max(0, Math.round((viewW - tile * blockUnits(cols)) / 2f));
        int padY = Math.max(0, Math.round((viewH - tile * blockUnits(rows)) / 2f));
        views.setViewPadding(R.id.widget_hit_grid, padX, padY, padX, padY);
        for (int r = 0; r < MAX_ROWS; r++) {
            views.setViewVisibility(ROW_IDS[r], r < rows ? View.VISIBLE : View.GONE);
            for (int c = 0; c < MAX_COLS; c++) {
                views.setViewVisibility(
                        TILE_IDS[r * MAX_COLS + c], c < cols ? View.VISIBLE : View.GONE);
            }
        }

        Intent openApp = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        for (int i = 0; i < cols * rows; i++) {
            int tileId = TILE_IDS[(i / cols) * MAX_COLS + (i % cols)];
            JSONObject item = items.optJSONObject(i);
            Intent intent = null;
            if (item != null) {
                intent = TitleShortcutManagerModule.buildOpenTitleIntent(
                        context,
                        item.optString("provider", "xcloud"),
                        item.optString("productId", ""),
                        item.optString("titleId", ""),
                        item.optString("xCloudTitleId", ""),
                        item.optString("gfnAppId", ""),
                        item.optString("gfnStore", ""),
                        item.optString("titleName", ""));
                views.setContentDescription(tileId, item.optString("titleName", ""));
            } else {
                intent = openApp;
            }
            if (intent == null) {
                continue;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            // A distinct request code per tile and widget: PendingIntents are
            // matched without their extras, so identical codes would collapse
            // the tiles into one.
            PendingIntent pending = PendingIntent.getActivity(
                    context, appWidgetId * 100 + i, intent, flags);
            views.setOnClickPendingIntent(tileId, pending);
        }
        manager.updateAppWidget(appWidgetId, views);
    }

    // ---- Drawing ---------------------------------------------------------

    private static Bitmap render(
            Context context, JSONArray items, int placeholder,
            int widthPx, int heightPx, int cols, int rows) {
        Bitmap bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float s = Math.min(widthPx / blockUnits(cols), heightPx / blockUnits(rows));
        float gap = GAP * s;
        float margin = MARGIN * s;
        float radius = RADIUS * s;
        // The block, centred in the bitmap.
        float originX = (widthPx - s * blockUnits(cols)) / 2f + margin;
        float originY = (heightPx - s * blockUnits(rows)) / 2f + margin;

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);

        for (int i = 0; i < cols * rows; i++) {
            float left = originX + (i % cols) * (s + gap);
            float top = originY + (i / cols) * (s + gap);
            RectF rect = new RectF(left, top, left + s, top + s);

            JSONObject item = items.optJSONObject(i);
            if (item == null) {
                // Empty slot: draw nothing (it still opens the app when tapped).
                continue;
            }

            Bitmap icon = null;
            String url = item.optString("iconUrl", "");
            if (!TextUtils.isEmpty(url)) {
                File file = iconFile(context, url);
                if (file.exists()) {
                    icon = BitmapFactory.decodeFile(file.getAbsolutePath());
                }
            }
            if (icon != null) {
                int px = Math.max(1, Math.round(s));
                Bitmap scaled = Bitmap.createScaledBitmap(icon, px, px, true);
                BitmapShader shader = new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
                Matrix matrix = new Matrix();
                matrix.setTranslate(left, top);
                shader.setLocalMatrix(matrix);
                fill.setShader(shader);
                canvas.drawRoundRect(rect, radius, radius, fill);
                fill.setShader(null);
            } else {
                // Artwork not downloaded (yet): a quiet filled tile.
                fill.setColor(Color.argb(0x55, Color.red(placeholder), Color.green(placeholder), Color.blue(placeholder)));
                canvas.drawRoundRect(rect, radius, radius, fill);
            }
        }
        return bitmap;
    }
}
