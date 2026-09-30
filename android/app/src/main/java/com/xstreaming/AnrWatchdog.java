package com.xstreaming;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * TEMPORARY diagnostic aid for tracking down the PS Plus streaming freeze
 * (Android shows a genuine "app isn't responding" system dialog during it --
 * the main/UI thread itself is blocked, not just a frozen video frame -- but
 * adb/logcat access wasn't available for this repro).
 *
 * The main thread pings itself every PING_INTERVAL_MS via a self-rescheduling
 * Handler.postDelayed(); as long as its Looper is processing messages at all,
 * that ping keeps arriving. This background thread just watches how stale
 * that ping gets: once it's been more than HANG_THRESHOLD_MS since the last
 * one, the main thread's Looper has stopped processing its queue entirely --
 * genuinely blocked, not just busy -- so this captures every live thread's
 * current stack (safe to inspect from any thread, doesn't need the target
 * thread's cooperation) and writes it to a file in app-internal storage.
 * AnrDiagnosticsModule exposes that file's content back to JS so it can be
 * shown on-screen after the app is relaunched, with no ADB needed at all.
 *
 * Remove this whole mechanism (this file, AnrDiagnosticsModule/Package, the
 * start() call in MainApplication, and the JS-side AnrDiagnostics screen)
 * once the freeze's real cause is found, fixed, and confirmed on-device --
 * this is a diagnostic tool, not a permanent feature.
 */
public class AnrWatchdog {
    private static final String TAG = "AnrWatchdog";
    private static final long PING_INTERVAL_MS = 500;
    private static final long CHECK_INTERVAL_MS = 1000;
    private static final long HANG_THRESHOLD_MS = 3000;
    static final String TRACE_FILE_NAME = "anr_trace.txt";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final File outputFile;
    private volatile long lastPing = System.currentTimeMillis();
    private volatile boolean reported = false;

    private final Runnable pingRunnable = new Runnable() {
        @Override
        public void run() {
            lastPing = System.currentTimeMillis();
            reported = false;
            mainHandler.postDelayed(this, PING_INTERVAL_MS);
        }
    };

    public AnrWatchdog(Context context) {
        this.outputFile = new File(context.getFilesDir(), TRACE_FILE_NAME);
    }

    public void start() {
        mainHandler.post(pingRunnable);
        Thread watchThread = new Thread(this::loop, "AnrWatchdog");
        watchThread.setDaemon(true);
        watchThread.start();
    }

    private void loop() {
        while (true) {
            try {
                Thread.sleep(CHECK_INTERVAL_MS);
            } catch (InterruptedException e) {
                return;
            }
            long elapsed = System.currentTimeMillis() - lastPing;
            if (elapsed > HANG_THRESHOLD_MS && !reported) {
                reported = true;
                captureAndWrite(elapsed);
            }
        }
    }

    private void captureAndWrite(long elapsedMs) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("ANR detected at ")
              .append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()))
              .append("\nMain thread unresponsive for >= ")
              .append(elapsedMs)
              .append("ms\n\n--- All live threads ---\n");

            for (Map.Entry<Thread, StackTraceElement[]> entry : Thread.getAllStackTraces().entrySet()) {
                Thread t = entry.getKey();
                sb.append("\n[").append(t.getName())
                  .append("] id=").append(t.getId())
                  .append(" state=").append(t.getState())
                  .append("\n");
                for (StackTraceElement el : entry.getValue()) {
                    sb.append("\tat ").append(el.toString()).append("\n");
                }
            }

            try (FileWriter writer = new FileWriter(outputFile, false)) {
                writer.write(sb.toString());
            }
            Log.e(TAG, "ANR captured, written to " + outputFile.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Failed to capture ANR trace", e);
        }
    }
}
