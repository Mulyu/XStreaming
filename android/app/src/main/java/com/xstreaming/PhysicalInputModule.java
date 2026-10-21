package com.xstreaming;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class PhysicalInputModule extends ReactContextBaseJavaModule {
    public PhysicalInputModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "PhysicalInput";
    }

    // JS enables this for the stream screens that consume physical keyboard/
    // mouse events; see PhysicalInput for the rest of the activation rules.
    @ReactMethod
    public void setEnabled(boolean enabled) {
        PhysicalInput.setEnabled(enabled);
    }

    // Required by NativeEventEmitter-style listeners; the events themselves
    // go out through DeviceEventManagerModule.
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}
