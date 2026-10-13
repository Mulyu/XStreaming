package com.xstreaming;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AppDebugLogModule extends ReactContextBaseJavaModule {
    public AppDebugLogModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AppDebugLog";
    }

    // Lets JS-side lifecycle events (App.tsx's AppState listener) land in
    // the exact same file/timeline as MainActivity's own onCreate/onResume/
    // onPause/onDestroy calls to AppDebugLog.log() -- a bug report is only
    // useful if the JS and native sides of "what happened" can be read as
    // one ordered trace, not two separate ones that have to be manually
    // interleaved by timestamp.
    @ReactMethod
    public void log(String tag, String message) {
        AppDebugLog.log(getReactApplicationContext(), tag, message);
    }

    // Same shape/cap as PsPlusModule.kt's getDebugLog() -- capped well under
    // Android's binder transaction limit (~1MB) so a long-accumulated log
    // can't fail to cross the RN bridge; most recent lines matter most for a
    // live repro, so trimming is from the front, not the back.
    @ReactMethod
    public void getDebugLog(Promise promise) {
        try {
            String text = AppDebugLog.read(getReactApplicationContext());
            int maxChars = 200_000;
            promise.resolve(text.length() > maxChars ? text.substring(text.length() - maxChars) : text);
        } catch (Exception e) {
            promise.reject("app_debug_log_failed", e.getMessage(), e);
        }
    }
}
