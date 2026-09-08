package com.xstreaming;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

// Keeps the WiFi radio out of power-save mode while a low-latency stream
// (xCloud/xHome/GFN) is active. Android's default WiFi power management lets
// the radio doze between packets to save battery, which shows up as latency
// jitter on real-time media even without any packet loss -- something a
// desktop client (always-on WiFi/Ethernet) never has to contend with.
// WIFI_MODE_FULL_LOW_LATENCY (API 29+) is tuned specifically for this;
// WIFI_MODE_FULL_HIGH_PERF is the pre-29 equivalent.
public class WifiPerformanceModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext ctx;
    private WifiManager.WifiLock wifiLock;

    public WifiPerformanceModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.ctx = reactContext;
    }

    @Override
    public String getName() {
        return "WifiPerformanceManager";
    }

    private WifiManager.WifiLock getOrCreateLock() {
        if (wifiLock == null) {
            WifiManager wifiManager = (WifiManager)
                    ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                return null;
            }
            int mode = Build.VERSION.SDK_INT >= 29
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifiManager.createWifiLock(mode, "XStreaming:stream");
            // Idempotent acquire/release regardless of call imbalance from the JS side.
            wifiLock.setReferenceCounted(false);
        }
        return wifiLock;
    }

    // Hold the WiFi radio at full performance while streaming. Safe to call
    // repeatedly; only meaningful on a WiFi connection (a no-op elsewhere).
    @ReactMethod
    public void acquire() {
        try {
            WifiManager.WifiLock lock = getOrCreateLock();
            if (lock != null && !lock.isHeld()) {
                lock.acquire();
            }
        } catch (Exception ignored) {
        }
    }

    @ReactMethod
    public void release() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {
        }
    }
}
