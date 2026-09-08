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
        } catch (Exception e) {
            // e.g. ForegroundServiceStartNotAllowedException if invoked from the
            // background on Android 12+. The service itself won't end up
            // running, but at least surface a notification instead of nothing.
            StreamKeepAliveService.updateNotification(
                    ctx.getApplicationContext(), title, text, disconnectLabel);
        }
    }

    // Get the service running (no notification yet) while the app is
    // definitely still in the foreground, so promote() can reliably show the
    // notification later even after the app backgrounds. See arm()'s comment
    // in StreamKeepAliveService for why this two-step avoids the
    // ForegroundServiceStartNotAllowedException risk `start()` above has.
    @ReactMethod
    public void arm() {
        try {
            StreamKeepAliveService.arm(ctx.getApplicationContext());
        } catch (Exception ignored) {
        }
    }

    // Show the ongoing notification on an already-armed (or already-running)
    // instance. Unlike start(), this is safe to call after the app has
    // backgrounded.
    @ReactMethod
    public void promote(
            String title, String text, String disconnectLabel, double deadlineEpochMs) {
        StreamKeepAliveService instance = StreamKeepAliveService.getInstance();
        if (instance != null) {
            instance.promote(title, text, disconnectLabel, (long) deadlineEpochMs);
        } else {
            // Not armed (e.g. process was restarted) -- best effort.
            start(title, text, disconnectLabel, deadlineEpochMs);
        }
    }

    // Hide the notification and drop foreground status without stopping the
    // service, so it stays armed and ready to promote() again later.
    @ReactMethod
    public void demote() {
        StreamKeepAliveService instance = StreamKeepAliveService.getInstance();
        if (instance != null) {
            instance.demote();
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
