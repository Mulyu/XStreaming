package com.xstreaming.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.xstreaming.R
import com.xstreaming.settings.Settings
import com.xstreaming.settings.saveSettings

// Mirrors SettingsView.tsx's Lane type/laneRow -- which tab is showing.
private enum class SettingsLane { COMMON, XBOX, GFN }

/**
 * Kotlin/Compose port of src/pages/settings/ui/SettingsView.tsx's lane-tab
 * structure (Common/Xbox/GeForce NOW). No JS/RN bridge: reads/writes the
 * same MMKV-backed Settings AppSettings.kt already exposes, so this and the
 * RN Settings screen stay on the same live data.
 *
 * [initialSettings] is read once by the caller (SettingsActivity), not here
 * -- see that file's own comment for why.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(initialSettings: Settings, onBack: () -> Unit) {
    val context = LocalContext.current
    var settings by remember { mutableStateOf(initialSettings) }
    var lane by remember { mutableStateOf(SettingsLane.COMMON) }

    fun update(patch: (Settings) -> Settings) {
        val next = patch(settings)
        settings = next
        saveSettings(context, next)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.Settings)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LaneTab(
                    label = stringResource(R.string.CommonSettings),
                    selected = lane == SettingsLane.COMMON,
                    onClick = { lane = SettingsLane.COMMON },
                    modifier = Modifier.weight(1f),
                )
                LaneTab(
                    label = stringResource(R.string.XboxSettings),
                    selected = lane == SettingsLane.XBOX,
                    onClick = { lane = SettingsLane.XBOX },
                    modifier = Modifier.weight(1f),
                )
                LaneTab(
                    label = stringResource(R.string.GfnSettings),
                    selected = lane == SettingsLane.GFN,
                    onClick = { lane = SettingsLane.GFN },
                    modifier = Modifier.weight(1f),
                )
            }
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                when (lane) {
                    SettingsLane.COMMON -> CommonLane(settings, ::update)
                    SettingsLane.XBOX -> XboxLane(onBack)
                    SettingsLane.GFN -> GfnLane()
                }
            }
        }
    }
}

// The provider-switch pill, matching SettingsView.tsx's own LaneButton look
// (a constant-width rounded pill, filled when selected) minus the RN
// TV-focus handling that has no meaning here.
@Composable
private fun LaneTab(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val containerColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val contentColor = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(999.dp),
        color = containerColor,
        contentColor = contentColor,
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
        }
    }
}

// Mirrors SettingsView.tsx's 'common' lane: BasesSettings (locale),
// DisplaySettings (native_low_latency_decoder), GamepadSettings
// (polling_rate/dead_zone), Others (anti_idle_max_minutes). The "Key
// mapping"/InputMapping row isn't here yet -- navigating to it means
// launching back into the RN-hosted screen, a separate follow-up.
@Composable
private fun CommonLane(settings: Settings, update: ((Settings) -> Settings) -> Unit) {
    val context = LocalContext.current

    SectionLabel(stringResource(R.string.BasesSettings))
    ChoiceRow(
        title = stringResource(R.string.app_language),
        description = stringResource(R.string.set_language_of_anystreaming),
        options = listOf(
            SettingOption("en", "English"),
            SettingOption("de", "Deutsch"),
            SettingOption("es", "Español"),
            SettingOption("pt", "Português"),
            SettingOption("ko", "한국어"),
            SettingOption("ja", "日本語"),
            SettingOption("hi", "हिन्दी"),
            SettingOption("zh", "简体中文"),
            SettingOption("zht", "繁體中文"),
        ),
        value = settings.locale,
        onChange = { v ->
            // Mirrors handleLocaleChange(): also turns off "follow system
            // locale" -- an explicit pick here must stick, the same as it
            // does on the JS screen.
            update { it.copy(locale = v, localeFollowSystem = false) }
            restartApp(context)
        },
    )

    SectionLabel(stringResource(R.string.DisplaySettings))
    SwitchRow(
        title = stringResource(R.string.ultra_low_latency_decoding),
        description = stringResource(R.string.UltraLowLatencyDecoderDesc),
        value = settings.nativeLowLatencyDecoder,
        onChange = { v ->
            update { it.copy(nativeLowLatencyDecoder = v) }
            restartAppDelayed(context)
        },
    )

    SectionLabel(stringResource(R.string.GamepadSettings))
    ChoiceRow(
        title = stringResource(R.string.polling_rate),
        description = stringResource(R.string.modify_controller_response_rate),
        options = listOf(
            SettingOption(250.0, "250HZ"),
            SettingOption(83.33, "83.33HZ"),
            SettingOption(62.5, "62.5HZ"),
            SettingOption(50.0, "50HZ"),
            SettingOption(41.67, "41.67HZ"),
            SettingOption(35.71, "35.71HZ"),
            SettingOption(31.25, "31.25HZ"),
            SettingOption(27.78, "27.78HZ"),
            SettingOption(25.0, "25HZ"),
            SettingOption(22.73, "22.73HZ"),
            SettingOption(20.83, "20.83HZ"),
            SettingOption(19.23, "19.23HZ"),
            SettingOption(17.86, "17.86HZ"),
            SettingOption(16.67, "16.67HZ"),
        ),
        value = settings.pollingRate,
        onChange = { v -> update { it.copy(pollingRate = v) } },
    )
    SliderRow(
        title = stringResource(R.string.joystick_dead_zone),
        description = stringResource(R.string.config_joystick_dead_zone),
        min = 0f,
        max = 0.9f,
        step = 0.01f,
        value = settings.deadZone.toFloat(),
        onChange = { v -> update { it.copy(deadZone = v.toDouble()) } },
        // Locale.ROOT, not the default locale -- matches the JS SliderRow
        // this ports (v.toFixed(2), always '.'-separated) rather than a
        // locale that could show ',' as the decimal separator.
        formatValue = { v -> String.format(java.util.Locale.ROOT, "%.2f", v) },
    )

    SectionLabel(stringResource(R.string.Others))
    SliderRow(
        title = stringResource(R.string.anti_idle_max_duration_minutes),
        description = stringResource(R.string.AntiIdleMaxDesc),
        min = 0f,
        max = 180f,
        step = 5f,
        value = settings.antiIdleMaxMinutes.toFloat(),
        onChange = { v -> update { it.copy(antiIdleMaxMinutes = v.toDouble()) } },
        formatValue = { v -> "${v.toInt()}m" },
    )
}

// Mirrors SettingsView.tsx's 'xbox' lane -- account row only so far; video/
// region/language rows land in a follow-up.
@Composable
private fun XboxLane(onBack: () -> Unit) {
    SectionLabel(stringResource(R.string.SectionAccount))
    XboxAccountRow(onBack = onBack)
}

// Mirrors SettingsView.tsx's 'gfn' lane -- account row only so far; video
// rows land in a follow-up.
@Composable
private fun GfnLane() {
    SectionLabel(stringResource(R.string.SectionAccount))
    GfnAccountRow()
}
