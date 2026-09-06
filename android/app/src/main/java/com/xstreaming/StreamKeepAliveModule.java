package com.xstreaming;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class StreamKeepAliveModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext ctx;

    public StreamKeepAliveModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.ctx = reactContext;
    }

    @Override
    public String getName() {
        return "StreamKeepAliveManager";
    }

    @ReactMethod
    public void start(
            String title, String text, String disconnectLabel, double deadlineEpochMs) {
        try {
            StreamKeepAliveService.start(
                    ctx.getApplicationContext(),
                    title,
                    text,
                    disconnectLabel,
                    (long) deadlineEpochMs);
        } catch (Exception ignored) {
            // e.g. ForegroundServiceStartNotAllowedException if invoked from the
            // background on Android 12+; the caller falls back to updateNotification.
        }
    }

    // Update the ongoing keep-alive notification text in place (e.g. live queue
    // position). Safe from the background.
    @ReactMethod
    public void update(String title, String text, String disconnectLabel) {
        StreamKeepAliveService.updateNotification(
                ctx.getApplicationContext(), title, text, disconnectLabel);
    }

    @ReactMethod
    public void stop() {
        StreamKeepAliveService.stop(ctx.getApplicationContext());
    }

    // Post a one-off heads-up notification (e.g. "queue seat ready"). Tapping it
    // brings the app to the front.
    @ReactMethod
    public void notifyReady(String title, String text) {
        StreamKeepAliveService.notifyReady(ctx.getApplicationContext(), title, text);
    }

    // Dismiss the one-off ready notification.
    @ReactMethod
    public void cancelReady() {
        StreamKeepAliveService.cancelReady(ctx.getApplicationContext());
    }

    // Whether the app is exempt from battery optimization. Many OEMs suspend
    // background execution (killing the keep-alive + keepalive) within a few
    // minutes unless the app is whitelisted, so we surface this to the user.
    @ReactMethod
    public void isIgnoringBatteryOptimizations(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            boolean ignoring =
                    pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            promise.resolve(ignoring);
        } catch (Exception e) {
            promise.resolve(true);
        }
    }

    @ReactMethod
    public void requestDisableBatteryOptimization() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }
        try {
            Intent intent =
                    new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception e) {
            try {
                Intent intent =
                        new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
            } catch (Exception ignored) {
            }
        }
    }
}
