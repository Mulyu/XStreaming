package com.xstreaming.settings

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.annotations.SerializedName
import com.xstreaming.AudioConfig
import com.xstreaming.LowLatencyDecoderConfig
import java.util.Locale

/**
 * Kotlin port of shared/lib/settings.ts, reading/writing the exact same
 * "user.settings" MMKV key via [NativeSettingsStore] -- no JS/RN bridge
 * involved at all, so the Compose settings UI keeps working even while the
 * RN JS side is unmounted/reloading. Keep both versions' field set,
 * defaults, and merge semantics in sync: this is a read/write path onto the
 * SAME live data the JS side still also reads and writes.
 */
data class DisplayOptions(
    val sharpness: Double,
    val saturation: Double,
    val contrast: Double,
    val brightness: Double,
)

data class Settings(
    val locale: String,
    @SerializedName("locale_follow_system") val localeFollowSystem: Boolean,
    val resolution: Double,
    @SerializedName("preferred_game_language") val preferredGameLanguage: String,
    @SerializedName("force_region_ip") val forceRegionIp: String,
    @SerializedName("signaling_home_name") val signalingHomeName: String,
    @SerializedName("signaling_cloud_name") val signalingCloudName: String,
    val codec: String,
    val vibration: Boolean,
    @SerializedName("dead_zone") val deadZone: Double,
    @SerializedName("video_format") val videoFormat: String,
    @SerializedName("screen_position") val screenPosition: String,
    @SerializedName("anti_idle_max_minutes") val antiIdleMaxMinutes: Double,
    @SerializedName("native_low_latency_decoder") val nativeLowLatencyDecoder: Boolean,
    @SerializedName("gamepad_maping") val gamepadMapping: Map<String, Double>?,
    @SerializedName("native_gamepad_maping") val nativeGamepadMapping: Map<String, Double>?,
    @SerializedName("polling_rate") val pollingRate: Double,
    @SerializedName("fsr_display_options") val fsrDisplayOptions: DisplayOptions,
    val ipv6: Boolean,
    val fsr: Boolean,
    val coop: Boolean,
    @SerializedName("audio_gain") val audioGain: Double,
    @SerializedName("background_mute") val backgroundMute: Boolean,
    @SerializedName("gfn_resolution") val gfnResolution: String,
    @SerializedName("gfn_fps") val gfnFps: Double,
    @SerializedName("gfn_bitrate_mode") val gfnBitrateMode: String,
    @SerializedName("gfn_bitrate") val gfnBitrate: Double,
    @SerializedName("gfn_region") val gfnRegion: String,
    @SerializedName("gfn_mouse_trackpad_sensitivity") val gfnMouseTrackpadSensitivity: Double,
    @SerializedName("gfn_native_webrtc") val gfnNativeWebrtc: Boolean,
    @SerializedName("xcloud_native_webrtc") val xcloudNativeWebrtc: Boolean,
)

val defaultSettings = Settings(
    locale = "en",
    localeFollowSystem = true,
    resolution = 720.0,
    preferredGameLanguage = "en-US",
    forceRegionIp = "",
    signalingHomeName = "",
    signalingCloudName = "",
    codec = "",
    vibration = true,
    deadZone = 0.1,
    videoFormat = "",
    screenPosition = "center",
    antiIdleMaxMinutes = 30.0,
    nativeLowLatencyDecoder = false,
    gamepadMapping = null,
    nativeGamepadMapping = null,
    pollingRate = 62.5,
    fsrDisplayOptions = DisplayOptions(sharpness = 2.0, saturation = 5.0, contrast = 5.0, brightness = 5.0),
    ipv6 = false,
    fsr = false,
    coop = false,
    audioGain = 1.0,
    backgroundMute = true,
    gfnResolution = "1920x1080",
    gfnFps = 60.0,
    gfnBitrateMode = "auto",
    gfnBitrate = 20.0,
    gfnRegion = "",
    gfnMouseTrackpadSensitivity = 1.4,
    gfnNativeWebrtc = true,
    xcloudNativeWebrtc = true,
)

private val gson = Gson()

// Mirrors shared/lib/locale.ts's SUPPORTED_LOCALES/normalizeAppLocale --
// same 9 app-supported locale codes, same fallback-to-"en" branching.
private fun normalizeAppLocale(locale: String?): String {
    val raw = (locale ?: "").replace("_", "-").lowercase(Locale.ROOT)
    if (raw == "zht") {
        return "zht"
    }
    if (raw.startsWith("zh")) {
        return if (raw.contains("hant") || raw.contains("tw") || raw.contains("hk") || raw.contains("mo")) {
            "zht"
        } else {
            "zh"
        }
    }
    if (raw.startsWith("de")) return "de"
    if (raw.startsWith("es")) return "es"
    if (raw.startsWith("pt")) return "pt"
    if (raw.startsWith("ko")) return "ko"
    if (raw.startsWith("ja")) return "ja"
    if (raw.startsWith("hi")) return "hi"
    return "en"
}

// Mirrors getRawSystemLocale()'s Android branch (NativeModules.I18nManager/
// PlatformConstants' locale) -- Locale.getDefault() is the same underlying
// Android system locale those native modules themselves read.
fun getSystemLocale(): String = normalizeAppLocale(Locale.getDefault().toLanguageTag())

// Field-by-field merge over defaultSettings, mirroring the TS version's
// `Object.assign({}, defaultSettings, parsed)`: a key present in the stored
// JSON (even if its value doesn't look like the expected type) is still
// read defensively, falling back to the default only when the key is
// genuinely absent or the stored value's JSON type doesn't match what this
// field expects -- not attempted here is matching JS's `!!` truthy
// coercion for every field (unnecessary: every field here is always
// written by this same app in its own expected type, never arbitrary
// external data).
private fun mergeWithDefaults(json: JsonObject): Settings {
    fun str(key: String, default: String): String =
        json.get(key)?.takeIf { it.isJsonPrimitive }?.asString ?: default

    fun bool(key: String, default: Boolean): Boolean =
        json.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean }?.asBoolean ?: default

    fun num(key: String, default: Double): Double =
        json.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asDouble ?: default

    fun gamepadMap(key: String, default: Map<String, Double>?): Map<String, Double>? {
        if (!json.has(key)) return default
        val obj = json.get(key)?.takeIf { it.isJsonObject }?.asJsonObject ?: return null
        val result = LinkedHashMap<String, Double>()
        for ((k, v) in obj.entrySet()) {
            if (v.isJsonPrimitive && v.asJsonPrimitive.isNumber) {
                result[k] = v.asDouble
            }
        }
        return result
    }

    fun numFrom(obj: JsonObject?, key: String, default: Double): Double =
        obj?.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asDouble ?: default

    val display = json.get("fsr_display_options")?.takeIf { it.isJsonObject }?.asJsonObject
    val fsrDisplayOptions = DisplayOptions(
        sharpness = numFrom(display, "sharpness", defaultSettings.fsrDisplayOptions.sharpness),
        saturation = numFrom(display, "saturation", defaultSettings.fsrDisplayOptions.saturation),
        contrast = numFrom(display, "contrast", defaultSettings.fsrDisplayOptions.contrast),
        brightness = numFrom(display, "brightness", defaultSettings.fsrDisplayOptions.brightness),
    )

    return Settings(
        locale = str("locale", defaultSettings.locale),
        // Overwritten by the caller right after this -- getSettings()'s own
        // "present vs. absent" rule for this one field doesn't fit the
        // generic default-fallback helpers above.
        localeFollowSystem = defaultSettings.localeFollowSystem,
        resolution = num("resolution", defaultSettings.resolution),
        preferredGameLanguage = str("preferred_game_language", defaultSettings.preferredGameLanguage),
        forceRegionIp = str("force_region_ip", defaultSettings.forceRegionIp),
        signalingHomeName = str("signaling_home_name", defaultSettings.signalingHomeName),
        signalingCloudName = str("signaling_cloud_name", defaultSettings.signalingCloudName),
        codec = str("codec", defaultSettings.codec),
        vibration = bool("vibration", defaultSettings.vibration),
        deadZone = num("dead_zone", defaultSettings.deadZone),
        videoFormat = str("video_format", defaultSettings.videoFormat),
        screenPosition = str("screen_position", defaultSettings.screenPosition),
        antiIdleMaxMinutes = num("anti_idle_max_minutes", defaultSettings.antiIdleMaxMinutes),
        nativeLowLatencyDecoder = bool("native_low_latency_decoder", defaultSettings.nativeLowLatencyDecoder),
        gamepadMapping = gamepadMap("gamepad_maping", defaultSettings.gamepadMapping),
        nativeGamepadMapping = gamepadMap("native_gamepad_maping", defaultSettings.nativeGamepadMapping),
        pollingRate = num("polling_rate", defaultSettings.pollingRate),
        fsrDisplayOptions = fsrDisplayOptions,
        ipv6 = bool("ipv6", defaultSettings.ipv6),
        fsr = bool("fsr", defaultSettings.fsr),
        coop = bool("coop", defaultSettings.coop),
        audioGain = num("audio_gain", defaultSettings.audioGain),
        backgroundMute = bool("background_mute", defaultSettings.backgroundMute),
        gfnResolution = str("gfn_resolution", defaultSettings.gfnResolution),
        gfnFps = num("gfn_fps", defaultSettings.gfnFps),
        gfnBitrateMode = str("gfn_bitrate_mode", defaultSettings.gfnBitrateMode),
        gfnBitrate = num("gfn_bitrate", defaultSettings.gfnBitrate),
        gfnRegion = str("gfn_region", defaultSettings.gfnRegion),
        gfnMouseTrackpadSensitivity = num(
            "gfn_mouse_trackpad_sensitivity",
            defaultSettings.gfnMouseTrackpadSensitivity,
        ),
        gfnNativeWebrtc = bool("gfn_native_webrtc", defaultSettings.gfnNativeWebrtc),
        xcloudNativeWebrtc = bool("xcloud_native_webrtc", defaultSettings.xcloudNativeWebrtc),
    )
}

// Mirrors getSettings() exactly, including its locale_follow_system
// present-vs-absent asymmetry: absent entirely (first run, no stored
// settings at all) defaults locale_follow_system to true; present in an
// existing (older) blob without this key defaults it to false instead.
fun getSettings(): Settings {
    val raw = NativeSettingsStore.nativeGetUserSettingsJson()
    if (raw.isNullOrEmpty()) {
        return defaultSettings.copy(locale = getSystemLocale(), localeFollowSystem = true)
    }
    return try {
        val parsed = JsonParser.parseString(raw).asJsonObject
        val hasLocaleFollowSystem = parsed.has("locale_follow_system")
        val localeFollowSystem = if (hasLocaleFollowSystem) {
            parsed.get("locale_follow_system")
                ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean }
                ?.asBoolean ?: false
        } else {
            false
        }
        val merged = mergeWithDefaults(parsed).copy(localeFollowSystem = localeFollowSystem)
        if (merged.localeFollowSystem) merged.copy(locale = getSystemLocale()) else merged
    } catch (e: Exception) {
        defaultSettings.copy(locale = getSystemLocale(), localeFollowSystem = true)
    }
}

// Mirrors saveSettings(): persists the whole Settings object as one JSON
// blob (matching JSON.stringify(totalSettings)) under the same MMKV key,
// then applies the same two always-synced native audio side effects --
// both already native Kotlin/Java in this app (AudioConfig/
// LowLatencyDecoderConfig), so this calls them directly, no bridge needed.
fun saveSettings(context: Context, settings: Settings) {
    NativeSettingsStore.nativeSetUserSettingsJson(gson.toJson(settings))
    try {
        // Stereo separation doesn't survive the stream's own latency, so
        // mono is now the only mode -- always force it rather than
        // exposing a toggle (matches shared/lib/settings.ts exactly).
        AudioConfig.setStereoEnabled(context, false)
        LowLatencyDecoderConfig.setEnabled(context, settings.nativeLowLatencyDecoder)
    } catch (e: Exception) {
        // Best-effort, matching the TS version's own catch-and-log.
    }
}

// Mirrors resetSettings(): writes defaultSettings directly, same as the TS
// version -- deliberately does NOT go through saveSettings()/its audio
// side effects, matching storage.set(STORE_KEY, ...) called bare there.
fun resetSettings() {
    NativeSettingsStore.nativeSetUserSettingsJson(gson.toJson(defaultSettings))
}
