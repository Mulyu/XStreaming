package com.xstreaming;

import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

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

    // Signal-quality diagnostics: a 2.4GHz band and/or a weak RSSI are common,
    // easy-to-overlook sources of jitter on WiFi that have nothing to do with
    // this app's streaming protocol -- 2.4GHz is congested and shares spectrum
    // with Bluetooth (game controllers, audio), and a weak signal means more
    // PHY-layer retransmissions with unpredictable delay. A desktop client on
    // Ethernet or a clean 5GHz link never has to contend with either. Some
    // fields may be unavailable without location permission on newer Android
    // versions; missing fields are simply omitted rather than failing.
    @ReactMethod
    public void getSignalInfo(Promise promise) {
        WritableMap result = Arguments.createMap();
        try {
            WifiManager wifiManager = (WifiManager)
                    ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo info = wifiManager != null ? wifiManager.getConnectionInfo() : null;
            if (info == null) {
                promise.resolve(result);
                return;
            }
            int rssi = info.getRssi();
            if (rssi != Integer.MIN_VALUE && rssi != 0) {
                result.putInt("rssi", rssi);
            }
            int linkSpeed = info.getLinkSpeed();
            if (linkSpeed > 0) {
                result.putInt("linkSpeedMbps", linkSpeed);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                int frequency = info.getFrequency();
                if (frequency > 0) {
                    String band = frequency < 3000 ? "2.4GHz"
                            : frequency < 5900 ? "5GHz"
                            : "6GHz";
                    result.putString("band", band);
                    result.putInt("frequencyMHz", frequency);
                }
            }
        } catch (Exception ignored) {
        }
        promise.resolve(result);
    }
}
