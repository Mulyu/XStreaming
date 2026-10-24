package com.xstreaming;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
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
 * The 2x2 "recently played" home-screen widget: the last four launched games
 * as icon tiles; a tap on one relaunches it straight into its stream through
 * the same intent a pinned shortcut uses.
 *
 * The list is pushed from JS (HomeWidgetModule) whenever a game is launched and
 * kept in SharedPreferences, so the widget keeps working with the app process
 * dead. Artwork is downloaded by the app at that moment and cached as small
 * files, because a widget cannot load URLs itself.
 *
 * The whole 2x2 is drawn into one bitmap so tile size, corner radius and gap
 * can follow the launcher's own icon grid exactly (measured from a real home
 * screen, in units of the icon size s: gap 0.38 s, corner radius 0.24 s, a
 * 0.033 s margin around the block), independent of the launcher's cell size.
 */
final class RecentTitlesWidget {
    static final int MAX_ITEMS = 4;

    private static final String PREFS = "anystreaming_recent_widget";
    private static final String KEY_ITEMS = "items";
    private static final String KEY_PLACEHOLDER = "placeholder";
    private static final String ICON_DIR = "widget_icons";
    private static final int ICON_PX = 256;
    private static final int DEFAULT_SIDE_DP = 160;
    private static final int MAX_BITMAP_PX = 640;

    // Geometry relative to the icon size s: side = (2 + GAP + 2 * MARGIN) * s.
    private static final float GAP = 0.38f;
    private static final float MARGIN = 0.033f;
    private static final float RADIUS = 0.24f;
    private static final float SIDE_IN_ICONS = 2f + GAP + 2f * MARGIN;

    private static final int[] TILE_IDS = {
            R.id.widget_tile_0, R.id.widget_tile_1, R.id.widget_tile_2, R.id.widget_tile_3};

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
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, DEFAULT_SIDE_DP);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, DEFAULT_SIDE_DP);
        float density = context.getResources().getDisplayMetrics().density;
        int sidePx = Math.round(Math.min(widthDp, heightDp) * density);
        sidePx = Math.max(64, Math.min(sidePx, MAX_BITMAP_PX));

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_recent_titles);
        views.setImageViewBitmap(R.id.widget_art, render(context, items, placeholder, sidePx));

        Intent openApp = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        for (int i = 0; i < MAX_ITEMS; i++) {
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
                views.setContentDescription(TILE_IDS[i], item.optString("titleName", ""));
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
            // the four tiles into one.
            PendingIntent pending = PendingIntent.getActivity(
                    context, appWidgetId * 10 + i, intent, flags);
            views.setOnClickPendingIntent(TILE_IDS[i], pending);
        }
        manager.updateAppWidget(appWidgetId, views);
    }

    // ---- Drawing ---------------------------------------------------------

    private static Bitmap render(Context context, JSONArray items, int placeholder, int sidePx) {
        Bitmap bitmap = Bitmap.createBitmap(sidePx, sidePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float s = sidePx / SIDE_IN_ICONS;
        float gap = GAP * s;
        float margin = MARGIN * s;
        float radius = RADIUS * s;
        float stroke = Math.max(2f, s * 0.03f);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint outline = new Paint(Paint.ANTI_ALIAS_FLAG);
        outline.setStyle(Paint.Style.STROKE);
        outline.setStrokeWidth(stroke);
        outline.setColor(placeholder);
        outline.setPathEffect(new DashPathEffect(new float[] {stroke * 3f, stroke * 2.5f}, 0f));

        for (int i = 0; i < MAX_ITEMS; i++) {
            float left = margin + (i % 2) * (s + gap);
            float top = margin + (i / 2) * (s + gap);
            RectF rect = new RectF(left, top, left + s, top + s);

            JSONObject item = items.optJSONObject(i);
            if (item == null) {
                // Empty slot: dashed outline with a plus.
                canvas.drawRoundRect(inset(rect, stroke / 2f), radius, radius, outline);
                float cx = rect.centerX();
                float cy = rect.centerY();
                float arm = s * 0.14f;
                Paint plus = new Paint(Paint.ANTI_ALIAS_FLAG);
                plus.setColor(placeholder);
                plus.setStrokeWidth(stroke);
                plus.setStrokeCap(Paint.Cap.ROUND);
                canvas.drawLine(cx - arm, cy, cx + arm, cy, plus);
                canvas.drawLine(cx, cy - arm, cx, cy + arm, plus);
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

    private static RectF inset(RectF rect, float amount) {
        return new RectF(rect.left + amount, rect.top + amount, rect.right - amount, rect.bottom - amount);
    }
}
