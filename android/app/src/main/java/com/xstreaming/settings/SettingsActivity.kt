package com.xstreaming.settings

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.xstreaming.settings.ui.DisplaySettingsScreen
import com.xstreaming.settings.ui.SettingsTheme

/**
 * Hosts the Jetpack Compose Settings screen. No JS/RN bridge: launched
 * directly as a plain Android Activity (see SettingsLauncherModule) and
 * reads/writes settings straight through AppSettings.kt's MMKV bridge.
 */
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SettingsTheme {
                DisplaySettingsScreen(onBack = { finish() })
            }
        }
    }
}
