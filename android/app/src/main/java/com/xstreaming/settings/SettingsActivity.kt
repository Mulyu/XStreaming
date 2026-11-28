package com.xstreaming.settings

import android.content.Context
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.xstreaming.settings.ui.SettingsScreen
import com.xstreaming.settings.ui.SettingsTheme
import java.util.Locale

/**
 * Hosts the Jetpack Compose Settings screen. No JS/RN bridge: launched
 * directly as a plain Android Activity (see SettingsLauncherModule) and
 * reads/writes settings straight through AppSettings.kt's MMKV bridge.
 */
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val context = this
            // Read once here, not again inside SettingsScreen: both
            // localizedContext() and the screen itself need it, and this is
            // an MMKV JNI read + JSON parse, not a free call.
            val settings = remember { getSettings(context) }
            val localizedContext = remember { localizedContext(context, settings.locale) }
            CompositionLocalProvider(LocalContext provides localizedContext) {
                SettingsTheme {
                    SettingsScreen(initialSettings = settings, onBack = { finish() })
                }
            }
        }
    }
}

// Applies the app's own stored language choice (settings.locale --
// independent of the device's system locale, exactly like src/i18n.ts does
// for the RN JS screens) to every stringResource() call under this
// Activity's Compose content, instead of letting it fall back to this
// Activity's own (device-locale) configuration. Only "en"/"ja" resources
// exist so far (android/app/src/main/res/values{,-ja}/settings_strings.xml);
// any other stored locale falls through to the default (English) values/
// the same way Android resource resolution always falls back for a
// qualifier it has no match for.
private fun localizedContext(context: Context, locale: String): Context {
    val config = Configuration(context.resources.configuration)
    config.setLocale(localeFor(locale))
    return context.createConfigurationContext(config)
}

// AppSettings.kt's normalizeAppLocale() codes aren't all real ISO language
// tags -- "zht" (Traditional Chinese) in particular isn't one, so
// Locale("zht") wouldn't match a real "zh-Hant"/"zh-rTW" resource qualifier
// if one is added later. Mapped explicitly here instead of passed through,
// even though no values-zh*/ directory exists yet (every non-"ja" locale
// currently falls back to the default values/ regardless).
private fun localeFor(code: String): Locale =
    if (code == "zht") Locale("zh", "TW") else Locale(code)
