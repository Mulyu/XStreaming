package com.xstreaming.settings.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.xstreaming.R
import com.xstreaming.settings.Settings
import com.xstreaming.settings.getSettings
import com.xstreaming.settings.saveSettings

/**
 * Kotlin/Compose port of the "Resolution"/"Codec"/"Ultra low latency
 * decoding" rows from src/features/app-settings/config/display.ts (option
 * values and order kept byte-for-byte identical -- see that file). No JS/RN
 * bridge: reads/writes the same MMKV-backed Settings AppSettings.kt already
 * exposes, so this and the RN Settings screen stay on the same live data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DisplaySettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var settings by remember { mutableStateOf(getSettings()) }

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
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            ChoiceRow(
                title = stringResource(R.string.Resolution),
                description = stringResource(R.string.set_resolution_support_720p_1080p_1080p_hq),
                options = listOf(
                    SettingOption(720.0, "720P"),
                    SettingOption(1080.0, "1080P"),
                    SettingOption(1081.0, "1080P(HQ)/1440P"),
                ),
                value = settings.resolution,
                onChange = { v -> update { it.copy(resolution = v) } },
            )
            SwitchRow(
                title = stringResource(R.string.ultra_low_latency_decoding),
                description = stringResource(R.string.UltraLowLatencyDecoderDesc),
                value = settings.nativeLowLatencyDecoder,
                onChange = { v -> update { it.copy(nativeLowLatencyDecoder = v) } },
            )
            ChoiceRow(
                title = stringResource(R.string.Codec),
                description = stringResource(
                    R.string.if_your_device_supports_newer_codecs_it_can_reduce_the_video_bandwidth_requirements,
                ),
                options = listOf(
                    SettingOption("", "Auto"),
                    SettingOption("video/H264-4d", "H264-High"),
                    SettingOption("video/H264-42e", "H264-Medium"),
                    SettingOption("video/H264-420", "H264-Low"),
                ),
                value = settings.codec,
                onChange = { v -> update { it.copy(codec = v) } },
            )
        }
    }
}
