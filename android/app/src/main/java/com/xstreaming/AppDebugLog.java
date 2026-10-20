package com.xstreaming;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// General-purpose, provider-agnostic sibling to PsPlusModule.kt's own
// debugLogFile()/getDebugLog() -- that one only ever captures what happens
// during an active PS Plus session (it's chiaki's own native log). This logs
// app-level foreground/background transitions (App.tsx's AppState listener)
// to one shared file, for the same reason PS Plus's log exists: most users
// have no adb access to pull a logcat capture, so this is the only way they
// can hand over a trace of what actually happened right before a bug.
public final class AppDebugLog {
    private static final String TAG = "AppDebugLog";
    private static final String LOG_FILE_NAME = "app_debug.log";
    private static final SimpleDateFormat TIMESTAMP_FORMAT =
            new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US);

    private AppDebugLog() {}

    // Unlike PS Plus's per-session file (overwritten fresh every
    // startSession()), this one accumulates across however many
    // background/foreground cycles it takes to reproduce an intermittent
    // bug -- so it needs its own cap to avoid growing forever over a long
    // install lifetime. Trimmed from the front (oldest lines) the same way
    // PsPlusModule.kt's getDebugLog() trims its *read*, just applied to the
    // file itself since this one is never rewritten wholesale on its own.
    private static final long MAX_FILE_BYTES = 1_000_000;

    private static File logFile(Context context) {
        return new File(context.getFilesDir(), LOG_FILE_NAME);
    }

    // Flushed on every call (a new FileWriter/close per line, same
    // reliability reason as chiaki's own log_cb_android_file: a capture is
    // only useful if the lines up to the moment of a freeze/crash actually
    // made it to disk).
    public static synchronized void log(Context context, String tag, String message) {
        File file = logFile(context);
        if (file.length() > MAX_FILE_BYTES) {
            String trimmed = read(context);
            trimmed = trimmed.substring(Math.max(0, trimmed.length() - (int) (MAX_FILE_BYTES / 2)));
            try (FileWriter writer = new FileWriter(file, false)) {
                writer.write(trimmed);
            } catch (IOException e) {
                Log.e(TAG, "Failed to trim app debug log", e);
            }
        }

        String line = "[" + TIMESTAMP_FORMAT.format(new Date()) + "] [" + tag + "] " + message;
        try (FileWriter writer = new FileWriter(file, true)) {
            writer.write(line);
            writer.write("\n");
        } catch (IOException e) {
            Log.e(TAG, "Failed to write app debug log", e);
        }
    }

    public static String read(Context context) {
        File file = logFile(context);
        if (!file.exists()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(file))) {
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                sb.append(buffer, 0, read);
            }
        } catch (IOException e) {
            Log.e(TAG, "Failed to read app debug log", e);
        }
        return sb.toString();
    }
}
