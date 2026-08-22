package com.xstreaming;

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
    public void start(String title, String text, String disconnectLabel) {
        StreamKeepAliveService.start(
                ctx.getApplicationContext(), title, text, disconnectLabel);
    }

    @ReactMethod
    public void stop() {
        StreamKeepAliveService.stop(ctx.getApplicationContext());
    }
}
