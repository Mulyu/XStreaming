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
    public static final String JS_EVENT_DISCONNECT = "StreamKeepAliveDisconnect";
    // 3h cap so a stranded service can't hold the CPU forever.
    private static final long WAKELOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000L;

    private PowerManager.WakeLock wakeLock;

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
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_DISCONNECT.equals(intent.getAction())) {
            emitDisconnect();
            stopSelf();
            return START_NOT_STICKY;
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

        createChannel();

        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(
                Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launch, piFlags);

        Intent disconnectIntent = new Intent(this, StreamKeepAliveService.class);
        disconnectIntent.setAction(ACTION_DISCONNECT);
        PendingIntent disconnectPending =
                PendingIntent.getService(this, 1, disconnectIntent, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        builder.setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .addAction(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        disconnectLabel,
                        disconnectPending);

        // When anti-idle is keeping the session awake with a max duration, show
        // a live count-down in the notification so the user can see how much
        // longer the session will be kept alive before it is allowed to idle
        // out. The chronometer updates natively (no JS wake-ups needed).
        if (deadlineEpochMs > System.currentTimeMillis()
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setWhen(deadlineEpochMs)
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true);
        } else {
            builder.setShowWhen(false);
        }

        Notification notification = builder.build();

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

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
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

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
