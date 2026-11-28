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
import androidx.compose.runtime.LaunchedEffect
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
import com.xstreaming.settings.GfnCloudMatchApi
import com.xstreaming.settings.GfnQueueStatus
import com.xstreaming.settings.GfnQueueStatusApi
import com.xstreaming.settings.GfnRegionOption
import com.xstreaming.settings.GfnSubscriptionInfo
import com.xstreaming.settings.GfnTokenRefresh
import com.xstreaming.settings.Settings
import com.xstreaming.settings.clearStreamToken
import com.xstreaming.settings.clearWebToken
import com.xstreaming.settings.clearXcloudData
import com.xstreaming.settings.getGfnAccountStatus
import com.xstreaming.settings.gfnGraphqlLocale
import com.xstreaming.settings.saveSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

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
                    SettingsLane.XBOX -> XboxLane(settings, ::update, onBack)
                    SettingsLane.GFN -> GfnLane(settings, ::update)
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

// Mirrors SettingsView.tsx's 'xbox' lane: SectionAccount (the Xbox account
// row -- its own playtime row is a separate, network-backed follow-up),
// SectionVideo (resolution/codec), SectionRegionSignaling (force_region_ip/
// xcloud_native_webrtc), SectionSignInLanguage (preferred_game_language).
//
// Not here: 'signaling_cloud' -- in the JS screen, its option list comes
// from the ACTIVE xCloud stream token's own getRegions() (see
// useSettingsScreen.ts's xgpuRegions), which only exists during a live
// JS-driven stream session; there is no equivalent data source reachable
// from this native-only screen, so this row would always render with zero
// options (effectively inert) rather than actually letting the user pick
// anything.
@Composable
private fun XboxLane(settings: Settings, update: ((Settings) -> Settings) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current

    SectionLabel(stringResource(R.string.SectionAccount))
    XboxAccountRow(onBack = onBack)

    SectionLabel(stringResource(R.string.SectionVideo))
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

    SectionLabel(stringResource(R.string.SectionRegionSignaling))
    ChoiceRow(
        title = stringResource(R.string.set_region),
        description = stringResource(
            R.string.changing_the_region_allows_you_to_use_xgpu_services_without_a_proxy,
        ),
        options = listOf(
            SettingOption("", stringResource(R.string.Default)),
            SettingOption("203.41.44.20", stringResource(R.string.Australia)),
            SettingOption("200.221.11.101", stringResource(R.string.Brazil1)),
            SettingOption("169.150.198.66", stringResource(R.string.Brazil2)),
            SettingOption("194.25.0.68", stringResource(R.string.Europe)),
            SettingOption("104.211.224.146", stringResource(R.string.south_india)),
            SettingOption("104.211.96.159", stringResource(R.string.central_india)),
            SettingOption("138.199.21.239", stringResource(R.string.Japan1)),
            SettingOption("210.131.113.123", stringResource(R.string.Japan2)),
            SettingOption("168.126.63.1", stringResource(R.string.Korea1)),
            SettingOption("121.125.60.151", stringResource(R.string.Korea2)),
            SettingOption("4.2.2.2", stringResource(R.string.united_states1)),
            SettingOption("143.244.47.65", stringResource(R.string.united_states2)),
            SettingOption("45.134.212.66", stringResource(R.string.Poland)),
        ),
        value = settings.forceRegionIp,
        onChange = { v ->
            // Mirrors handleForceRegionChange(): the region change can make
            // the cached stream/web token and xCloud catalog stale (wrong
            // region's data), so drop them before restarting.
            clearStreamToken(context)
            clearWebToken(context)
            clearXcloudData(context)
            update { it.copy(forceRegionIp = v) }
            restartAppDelayed(context)
        },
    )
    // SettingsView.tsx renders this one as a SwitchRow (not the radio list
    // its own config metadata's type: 'radio' would suggest) -- matching
    // that, and the sibling SwitchRow this screen already uses one lane
    // over for native_low_latency_decoder, rather than a heavier 2-option
    // radio list for a plain boolean.
    SwitchRow(
        title = stringResource(R.string.XcloudNativeWebRtcTitle),
        description = stringResource(R.string.XcloudNativeWebRtcDesc),
        value = settings.xcloudNativeWebrtc,
        onChange = { v -> update { it.copy(xcloudNativeWebrtc = v) } },
    )

    SectionLabel(stringResource(R.string.SectionSignInLanguage))
    ChoiceRow(
        title = stringResource(R.string.preferred_language_of_game),
        description = stringResource(R.string.set_language_of_cloud_game),
        options = PREFERRED_GAME_LANGUAGE_OPTIONS,
        value = settings.preferredGameLanguage,
        onChange = { v ->
            // Mirrors handlePreferredLanguageChange(): a different game
            // language can return a different catalog, so the cached one
            // needs dropping too -- no restart, same as the JS handler.
            clearXcloudData(context)
            update { it.copy(preferredGameLanguage = v) }
        },
    )
}

// bases.ts's preferred_game_language option labels are literal English
// text, not translation keys (unlike the country names above) -- ported
// verbatim, same as that file, EXCEPT "fi-FI": bases.ts mislabels it
// "Swedish" (duplicating "sv-SE"'s own label) -- a pre-existing bug in that
// file, left alone there (out of scope for this PR), but fixed here since
// this label is a cosmetic, independent copy with no shared-state
// compatibility requirement -- unlike this app's stored setting VALUES
// (the "fi-FI" string itself is unchanged, so this fix affects only how
// the option reads, not what gets saved).
private val PREFERRED_GAME_LANGUAGE_OPTIONS = listOf(
    SettingOption("", "Default"),
    SettingOption("ar-SA", "Arabic (Saudi Arabia)"),
    SettingOption("cs-CZ", "Czech"),
    SettingOption("da-DK", "Danish"),
    SettingOption("de-DE", "German"),
    SettingOption("el-GR", "Greek"),
    SettingOption("en-GB", "English (United Kingdom)"),
    SettingOption("en-US", "English (United States)"),
    SettingOption("es-ES", "Spanish (Spain)"),
    SettingOption("es-MX", "Spanish (Mexico)"),
    SettingOption("fi-FI", "Finnish"),
    SettingOption("fr-FR", "French"),
    SettingOption("he-IL", "Hebrew"),
    SettingOption("hu-HU", "Hungarian"),
    SettingOption("it-IT", "Italian"),
    SettingOption("ja-JP", "日本語"),
    SettingOption("ko-KR", "Korean"),
    SettingOption("nb-NO", "Norwegian"),
    SettingOption("nl-NL", "Dutch"),
    SettingOption("pl-PL", "Polish"),
    SettingOption("pt-BR", "Portuguese (Brazil)"),
    SettingOption("pt-PT", "Portuguese (Portugal)"),
    SettingOption("ru-RU", "Russian"),
    SettingOption("sk-SK", "Slovak"),
    SettingOption("sv-SE", "Swedish"),
    SettingOption("tr-TR", "Turkish"),
    SettingOption("zh-CN", "简体中文"),
    SettingOption("zh-TW", "繁體中文"),
)

// Mirrors SettingsView.tsx's 'gfn' lane: SectionAccount (the GFN account
// row + its playtime figure -- the queue-status/resync-library rows are a
// separate, later follow-up), SectionVideo (gfn_resolution/gfn_fps/
// gfn_bitrate_mode/gfn_bitrate/gfn_region/gfn_native_webrtc).
@Composable
private fun GfnLane(settings: Settings, update: ((Settings) -> Settings) -> Unit) {
    val context = LocalContext.current
    var gfnStatus by remember { mutableStateOf(getGfnAccountStatus(context)) }
    var gfnRegions by remember { mutableStateOf<List<GfnRegionOption>>(emptyList()) }
    var gfnSubscription by remember { mutableStateOf<GfnSubscriptionInfo?>(null) }
    var gfnPlaytimeLoading by remember { mutableStateOf(false) }
    var gfnPlaytimeFailed by remember { mutableStateOf(false) }
    var gfnQueue by remember { mutableStateOf<GfnQueueStatus?>(null) }
    var gfnQueueLoading by remember { mutableStateOf(false) }

    // Mirrors useSettingsScreen.ts's loadGfnPlaytime()/gfnRegions-loading/
    // queue-status-loading effects, all keyed on gfnSignedIn: re-runs
    // whenever GfnAccountRow signs in/out (gfnStatus.signedIn changing),
    // not just once at mount.
    LaunchedEffect(gfnStatus.signedIn) {
        if (!gfnStatus.signedIn) {
            gfnRegions = emptyList()
            gfnSubscription = null
            gfnPlaytimeFailed = false
            gfnQueue = null
            // Also resets gfnQueueLoading: a sign-out that happens WHILE a
            // previous (signedIn=true) run of this effect was still
            // suspended -- e.g. awaiting getValidGfnJwt() -- cancels that
            // run before it ever reaches the launch{} that would otherwise
            // clear this, leaving the queue row stuck on "Checking the
            // queue..." forever.
            gfnQueueLoading = false
            return@LaunchedEffect
        }
        gfnPlaytimeLoading = true
        gfnPlaytimeFailed = false
        gfnQueueLoading = true
        try {
            val jwt = GfnTokenRefresh.getValidGfnJwt(context)
            val userId = if (jwt != null) GfnTokenRefresh.getValidGfnUserId(context) else null
            if (jwt == null || userId == null) {
                gfnPlaytimeFailed = true
                gfnQueue = null
                gfnQueueLoading = false
            } else {
                val serverInfo = GfnCloudMatchApi.fetchGfnServerInfo(context, jwt)
                gfnRegions = serverInfo.regions
                // Mirrors useSettingsScreen.ts's own queue-status load:
                // the same vpcId the subscription call below uses,
                // launched (not awaited) so it runs IN PARALLEL with that
                // call -- matching that TS code's own comment ("it loads
                // in parallel and never affects the playtime row"), rather
                // than making the playtime row wait on the unofficial,
                // possibly slow/unresponsive queue tracker.
                launch {
                    try {
                        gfnQueue = serverInfo.vpcId?.let { GfnQueueStatusApi.fetchGfnQueueStatus(it) }
                    } finally {
                        gfnQueueLoading = false
                    }
                }
                val subscription = GfnCloudMatchApi.fetchGfnSubscription(
                    context,
                    jwt,
                    userId,
                    gfnGraphqlLocale(settings.locale),
                    serverInfo.vpcId,
                )
                if (subscription != null) {
                    gfnSubscription = subscription
                } else {
                    gfnPlaytimeFailed = true
                }
            }
        } catch (e: CancellationException) {
            // Structured concurrency: switching lanes (or leaving the
            // screen) cancels this LaunchedEffect -- must keep propagating,
            // not be treated as an ordinary playtime-load failure. Every
            // GFN suspend function this effect calls already does the same.
            throw e
        } catch (e: Exception) {
            gfnPlaytimeFailed = true
        } finally {
            gfnPlaytimeLoading = false
        }
    }

    SectionLabel(stringResource(R.string.SectionAccount))
    GfnAccountRow(status = gfnStatus, onStatusChanged = { gfnStatus = it })
    InfoRow(
        title = stringResource(R.string.GfnPlaytimeTitle),
        value = gfnPlaytimeText(gfnStatus.signedIn, gfnPlaytimeLoading, gfnSubscription, gfnPlaytimeFailed),
    )
    InfoRow(
        title = stringResource(R.string.GfnQueueTitle),
        value = gfnQueueText(gfnQueue, gfnQueueLoading),
    )

    SectionLabel(stringResource(R.string.SectionVideo))
    ChoiceRow(
        title = stringResource(R.string.GfnResolutionTitle),
        description = stringResource(R.string.GfnResolutionDesc),
        options = listOf(
            SettingOption("1280x720", "720P"),
            SettingOption("1920x1080", "1080P"),
            SettingOption("2560x1440", "1440P"),
        ),
        value = settings.gfnResolution,
        onChange = { v -> update { it.copy(gfnResolution = v) } },
    )
    ChoiceRow(
        title = stringResource(R.string.GfnFpsTitle),
        description = stringResource(R.string.GfnFpsDesc),
        options = listOf(
            SettingOption(30.0, "30 FPS"),
            SettingOption(60.0, "60 FPS"),
        ),
        value = settings.gfnFps,
        onChange = { v -> update { it.copy(gfnFps = v) } },
    )
    ChoiceRow(
        title = stringResource(R.string.GfnBitrateTitle),
        description = stringResource(R.string.GfnBitrateDesc),
        options = listOf(
            SettingOption("auto", stringResource(R.string.Auto)),
            SettingOption("custom", stringResource(R.string.Custom)),
        ),
        value = settings.gfnBitrateMode,
        onChange = { v -> update { it.copy(gfnBitrateMode = v) } },
    )
    if (settings.gfnBitrateMode == "custom") {
        SliderRow(
            title = stringResource(R.string.Custom),
            description = null,
            min = 4f,
            max = 50f,
            step = 1f,
            value = settings.gfnBitrate.toFloat(),
            onChange = { v -> update { it.copy(gfnBitrate = v.toDouble()) } },
            formatValue = { v -> "${v.toInt()} Mbps" },
        )
    }
    ChoiceRow(
        title = stringResource(R.string.GfnRegionTitle),
        description = stringResource(R.string.GfnRegionDesc),
        options = listOf(SettingOption("", stringResource(R.string.Auto))) +
            gfnRegions.map { SettingOption(it.url, it.name) },
        value = settings.gfnRegion,
        onChange = { v -> update { it.copy(gfnRegion = v) } },
    )
    SwitchRow(
        title = stringResource(R.string.GfnNativeWebRtcTitle),
        description = stringResource(R.string.GfnNativeWebRtcDesc),
        value = settings.gfnNativeWebrtc,
        onChange = { v -> update { it.copy(gfnNativeWebrtc = v) } },
    )
}

// Mirrors useSettingsScreen.ts's gfnPlaytimeDescription().
@Composable
private fun gfnPlaytimeText(
    signedIn: Boolean,
    loading: Boolean,
    subscription: GfnSubscriptionInfo?,
    failed: Boolean,
): String {
    if (!signedIn) {
        return stringResource(R.string.GfnPlaytimeSignedOutDesc)
    }
    if (loading && subscription == null) {
        return stringResource(R.string.GfnPlaytimeLoading)
    }
    if (subscription != null) {
        if (subscription.isUnlimited) {
            return stringResource(R.string.GfnPlaytimeUnlimited)
        }
        val totalMinutes = maxOf(0, Math.round(subscription.remainingHours * 60).toInt())
        return stringResource(R.string.GfnPlaytimeRemaining, totalMinutes / 60, totalMinutes % 60)
    }
    if (failed) {
        return stringResource(R.string.GfnPlaytimeUnavailable)
    }
    return stringResource(R.string.GfnPlaytimeLoading)
}

// Mirrors useSettingsScreen.ts's gfnQueueDescription().
@Composable
private fun gfnQueueText(queue: GfnQueueStatus?, loading: Boolean): String {
    if (queue != null) {
        return stringResource(R.string.GfnQueueValue, queue.waiting, queue.etaMinutes)
    }
    return if (loading) stringResource(R.string.GfnQueueLoading) else stringResource(R.string.GfnQueueUnavailable)
}
