package com.xstreaming;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import com.facebook.react.ReactApplication;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * A foreground service that keeps the app process (and therefore the WebRTC
 * stream + xCloud keepalive) alive while the app is backgrounded without PiP.
 * Tapping its ongoing notification brings the (singleTask) MainActivity back to
 * the front, resuming the live game; its Disconnect action ends the session.
 */
public class StreamKeepAliveService extends Service {
    public static final String CHANNEL_ID = "stream_keepalive";
    // Separate, higher-importance channel + id for one-off alerts (e.g. a GFN
    // queue seat becoming ready) so they pop as a heads-up notification.
    public static final String READY_CHANNEL_ID = "stream_ready";
    private static final int NOTIFICATION_ID = 4711;
    private static final int READY_NOTIFICATION_ID = 4712;
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_DISCONNECT_LABEL = "disconnectLabel";
    // Epoch millis when anti-idle stops keeping the session awake; 0 = no
    // countdown (anti-idle disabled). Drives a live notification chronometer.
    public static final String EXTRA_DEADLINE = "deadline";
    public static final String ACTION_DISCONNECT = "com.xstreaming.action.KEEPALIVE_DISCONNECT";
    // Start the service without promoting it to foreground yet -- see arm().
    public static final String ACTION_ARM = "com.xstreaming.action.KEEPALIVE_ARM";
    public static final String JS_EVENT_DISCONNECT = "StreamKeepAliveDisconnect";
    // 3h cap so a stranded service can't hold the CPU forever.
    private static final long WAKELOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000L;

    // Set in onCreate/cleared in onDestroy, so promote()/demote() can be
    // invoked as plain in-process method calls instead of through a new
    // Context.startForegroundService()/startService() call -- the latter is
    // what Android disallows once the app has left the foreground.
    private static StreamKeepAliveService instance;

    private PowerManager.WakeLock wakeLock;

    // Start the service as a plain (non-foreground, no notification) service
    // while the app is still known to be in the foreground (e.g. right when a
    // stream connects). Because Context.startService() -- unlike
    // startForegroundService() -- carries no "must call startForeground()
    // within 5s" obligation, this leaves the service simply alive and ready:
    // promote() can then reliably show the notification later even after the
    // app backgrounds, since that only needs an already-running instance to
    // call Service#startForeground() on itself, which isn't subject to the
    // background-start restriction.
    public static void arm(Context context) {
        Intent intent = new Intent(context, StreamKeepAliveService.class);
        intent.setAction(ACTION_ARM);
        context.startService(intent);
    }

    public static StreamKeepAliveService getInstance() {
        return instance;
    }

    public static void start(
            Context context,
            String title,
            String text,
            String disconnectLabel,
            long deadlineEpochMs) {
        Intent intent = new Intent(context, StreamKeepAliveService.class);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_DISCONNECT_LABEL, disconnectLabel);
        intent.putExtra(EXTRA_DEADLINE, deadlineEpochMs);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, StreamKeepAliveService.class));
    }

    /**
     * Post a one-off, high-importance heads-up notification. Used to alert the
     * user that something is ready (e.g. a GeForce NOW queue seat) while the app
     * is backgrounded. Tapping it brings the (singleTask) MainActivity forward,
     * where the pending stream screen resumes and connects.
     */
    public static void notifyReady(Context context, String title, String text) {
        if (title == null) {
            title = "XStreaming";
        }
        if (text == null) {
            text = "Ready";
        }
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && nm.getNotificationChannel(READY_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                    READY_CHANNEL_ID,
                    "Session ready",
                    NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(channel);
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent =
                PendingIntent.getActivity(context, 2, launch, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, READY_CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context)
                    .setPriority(Notification.PRIORITY_HIGH);
        }
        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentIntent(contentIntent)
                .setAutoCancel(true);
        nm.notify(READY_NOTIFICATION_ID, builder.build());
    }

    public static void cancelReady(Context context) {
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(READY_NOTIFICATION_ID);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_DISCONNECT.equals(intent.getAction())) {
            emitDisconnect();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_ARM.equals(intent.getAction())) {
            // Stay alive as a plain service; promote() shows the notification
            // (and calls startForeground) later, on demand.
            return START_STICKY;
        }

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        String disconnectLabel =
                intent != null ? intent.getStringExtra(EXTRA_DISCONNECT_LABEL) : null;
        long deadlineEpochMs = intent != null ? intent.getLongExtra(EXTRA_DEADLINE, 0L) : 0L;
        if (title == null) {
            title = "XStreaming";
        }
        if (text == null) {
            text = "Keeping the game session alive";
        }
        if (disconnectLabel == null) {
            disconnectLabel = "Disconnect";
        }

        createChannel(this);

        Notification notification =
                buildOngoingNotification(this, title, text, disconnectLabel, deadlineEpochMs);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        acquireWakeLock();
        return START_STICKY;
    }

    // Promote an already-armed (or already-foreground) instance to show the
    // ongoing notification. Safe to call after the app has backgrounded --
    // unlike Context.startForegroundService(), Service#startForeground() on a
    // live instance has no foreground-app requirement.
    public void promote(String title, String text, String disconnectLabel, long deadlineEpochMs) {
        createChannel(this);
        Notification notification =
                buildOngoingNotification(this, title, text, disconnectLabel, deadlineEpochMs);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        acquireWakeLock();
    }

    // Hide the notification and drop foreground status, but keep the service
    // (and this instance) alive so it can be promoted again later without
    // needing another Context-level service start.
    public void demote() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        releaseWakeLock();
    }

    private void emitDisconnect() {
        try {
            ReactContext reactContext = ((ReactApplication) getApplication())
                    .getReactNativeHost()
                    .getReactInstanceManager()
                    .getCurrentReactContext();
            if (reactContext != null) {
                reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(JS_EVENT_DISCONNECT, null);
            }
        } catch (Exception ignored) {
        }
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK, "xstreaming:keepalive");
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Background streaming",
                        NotificationManager.IMPORTANCE_LOW);
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    // Build the ongoing keep-alive notification (tap to return, Disconnect
    // action, optional anti-idle count-down). Shared by the initial
    // startForeground and later text updates (e.g. live queue position).
    private static Notification buildOngoingNotification(
            Context context,
            String title,
            String text,
            String disconnectLabel,
            long deadlineEpochMs) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent =
                PendingIntent.getActivity(context, 0, launch, piFlags);

        Intent disconnectIntent = new Intent(context, StreamKeepAliveService.class);
        disconnectIntent.setAction(ACTION_DISCONNECT);
        PendingIntent disconnectPending =
                PendingIntent.getService(context, 1, disconnectIntent, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
        }
        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .addAction(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        disconnectLabel != null ? disconnectLabel : "Disconnect",
                        disconnectPending);

        if (deadlineEpochMs > System.currentTimeMillis()
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setWhen(deadlineEpochMs)
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true);
        } else {
            builder.setShowWhen(false);
        }
        return builder.build();
    }

    /**
     * Update the ongoing keep-alive notification's text in place (e.g. the live
     * GeForce NOW queue position). Safe to call from the background because it
     * re-posts the existing notification id rather than (re)starting a service.
     */
    public static void updateNotification(
            Context context, String title, String text, String disconnectLabel) {
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        createChannel(context);
        nm.notify(
                NOTIFICATION_ID,
                buildOngoingNotification(
                        context,
                        title != null ? title : "XStreaming",
                        text != null ? text : "",
                        disconnectLabel,
                        0L));
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
