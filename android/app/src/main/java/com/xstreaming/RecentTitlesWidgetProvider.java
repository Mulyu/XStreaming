package com.xstreaming;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Home-screen widget host callbacks; all drawing lives in {@link RecentTitlesWidget}. */
public class RecentTitlesWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RecentTitlesWidget.update(context, manager, id);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        // The launcher resized the widget (or rotated): redraw at the new size.
        RecentTitlesWidget.update(context, manager, appWidgetId);
    }
}
