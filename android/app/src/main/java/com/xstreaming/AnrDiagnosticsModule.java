package com.xstreaming;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * TEMPORARY: JS-side access to whatever AnrWatchdog last captured. See that
 * class's own comment -- remove both together once the freeze is fixed.
 */
public class AnrDiagnosticsModule extends ReactContextBaseJavaModule {

    ReactApplicationContext reactContext;

    public AnrDiagnosticsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "AnrDiagnostics";
    }

    private File traceFile() {
        return new File(reactContext.getFilesDir(), AnrWatchdog.TRACE_FILE_NAME);
    }

    @ReactMethod
    public void getLastAnrTrace(Promise promise) {
        try {
            File file = traceFile();
            if (!file.exists()) {
                promise.resolve(null);
                return;
            }
            byte[] bytes = Files.readAllBytes(file.toPath());
            promise.resolve(new String(bytes, StandardCharsets.UTF_8));
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void clearAnrTrace(Promise promise) {
        try {
            File file = traceFile();
            if (file.exists()) {
                file.delete();
            }
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
