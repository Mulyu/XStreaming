package com.xstreaming.settings

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The one JS/RN bridge call this feature has: a plain "launch this
 * Activity" intent, same shape as any other screen navigation. It carries
 * no settings data -- SettingsActivity reads/writes those itself via
 * AppSettings.kt, with no bridge involved.
 */
class SettingsLauncherModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SettingsLauncherModule"

    @ReactMethod
    fun openNativeSettings() {
        val context = reactApplicationContext
        val intent = Intent(context, SettingsActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
