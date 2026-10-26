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

    // While on, physical keyboard key presses are reported to JS and swallowed
    // on any screen (the input-mapping editor uses it to learn which key the
    // user pressed).
    @ReactMethod
    public void setKeyCapture(boolean enabled) {
        PhysicalInput.setKeyCapture(enabled);
    }

    // TV diagnostics: while on, a text snapshot of the capture state is sent
    // to JS as onPhysicalDebug every half second.
    @ReactMethod
    public void setDebugOverlay(boolean enabled) {
        PhysicalInput.setDebugOverlay(enabled);
    }

    // Required by NativeEventEmitter-style listeners; the events themselves
    // go out through DeviceEventManagerModule.
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}
