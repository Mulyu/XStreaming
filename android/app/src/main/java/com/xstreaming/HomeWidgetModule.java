package com.xstreaming;

import android.content.Context;
import android.graphics.Color;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;

import org.json.JSONArray;
import org.json.JSONObject;

/** Lets JS push the recently launched titles to the home-screen widget. */
public class HomeWidgetModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public HomeWidgetModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "HomeWidget";
    }

    /**
     * @param items            most recent first; each carries the same fields the
     *                         pinned-shortcut request does (provider, ids,
     *                         titleName, iconUrl)
     * @param placeholderColor colour for empty slots, e.g. "#6C7597"
     */
    @ReactMethod
    public void setRecentTitles(ReadableArray items, String placeholderColor) {
        final Context context = reactContext.getApplicationContext();
        final JSONArray array = new JSONArray();
        try {
            for (int i = 0; i < items.size() && i < RecentTitlesWidget.MAX_ITEMS; i++) {
                if (items.getType(i) != ReadableType.Map) {
                    continue;
                }
                ReadableMap map = items.getMap(i);
                JSONObject json = new JSONObject();
                for (String key : new String[] {
                        "provider", "productId", "titleId", "xCloudTitleId",
                        "gfnAppId", "gfnStore", "titleName", "iconUrl"}) {
                    if (map.hasKey(key) && map.getType(key) == ReadableType.String) {
                        json.put(key, map.getString(key));
                    }
                }
                array.put(json);
            }
        } catch (Exception e) {
            return;
        }

        int color;
        try {
            color = Color.parseColor(placeholderColor);
        } catch (Exception e) {
            color = Color.parseColor("#6C7597");
        }
        final int placeholder = color;

        RecentTitlesWidget.save(context, array, placeholder);
        RecentTitlesWidget.updateAll(context);

        // Artwork needs the network: fetch it off the bridge thread, then
        // redraw once the covers are on disk.
        new Thread(() -> {
            if (RecentTitlesWidget.ensureIcons(context, array)) {
                RecentTitlesWidget.updateAll(context);
            }
            RecentTitlesWidget.pruneIcons(context, array);
        }).start();
    }
}
