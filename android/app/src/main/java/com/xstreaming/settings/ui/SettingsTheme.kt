package com.xstreaming.settings.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Matches android/app/src/main/res/values/colors.xml's primary/accent, the
// same brand colors the rest of the (non-Compose) app UI uses.
private val Primary = Color(0xFF162D50)
private val PrimaryDark = Color(0xFF000128)
private val Accent = Color(0xFFFFAAEE)

private val LightColors = lightColorScheme(
    primary = Primary,
    secondary = Accent,
    tertiary = Accent,
)

private val DarkColors = darkColorScheme(
    primary = Accent,
    secondary = Accent,
    tertiary = Accent,
    background = PrimaryDark,
)

@Composable
fun SettingsTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
