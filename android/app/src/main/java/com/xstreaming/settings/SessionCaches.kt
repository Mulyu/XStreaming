package com.xstreaming.settings

import android.content.Context
import com.google.gson.JsonArray
import com.google.gson.JsonObject

/**
 * Kotlin port of the small session-cache "forget this" helpers a settings
 * change invalidates -- entities/xbox-token/model/{streamTokenStore,
 * webTokenStore,profileCache,membership}.ts and entities/catalog-title/
 * model/xcloudCache.ts's clearXcloudData. No JS/RN bridge: these write the
 * exact same MMKV keys those JS modules already write, via
 * [NativeSettingsStore]. Composed the same way the JS originals call each
 * other (clearWebToken() also drops the profile cache; clearXboxProfileCache()
 * also drops the membership flag) rather than each being a flat, independent
 * JNI call.
 */

// Every function below takes a Context and calls ensureMmkvInitialized()
// first, like every other MMKV entry point in this package (getSettings(),
// getGfnAccountStatus(), ...) -- without it, a native-only process start
// (SettingsActivity recreated directly after Android killed the process in
// the background, with RN/JS never having run) would hit these before MMKV
// has a root directory, and the native write/removeValueForKey calls below
// would silently no-op.

fun clearStreamToken(context: Context) {
    ensureMmkvInitialized(context)
    NativeSettingsStore.nativeClearStreamToken()
}

// Mirrors membership.ts's clearXboxMembership(): forgets the last known
// Gold/Silver state (a different account starts as active again).
fun clearXboxMembership(context: Context) {
    ensureMmkvInitialized(context)
    NativeSettingsStore.nativeClearXboxMembership()
}

// Mirrors profileCache.ts's clearXboxProfileCache(): drops the cached
// gamertag/tier, then (same as the JS version) the membership flag derived
// from it too.
fun clearXboxProfileCache(context: Context) {
    ensureMmkvInitialized(context)
    NativeSettingsStore.nativeClearXboxProfileCache()
    clearXboxMembership(context)
}

// Mirrors webTokenStore.ts's clearWebToken(): resets the web token, then
// (same as the JS version) the profile cache it's used to populate.
fun clearWebToken(context: Context) {
    ensureMmkvInitialized(context)
    NativeSettingsStore.nativeClearWebToken()
    clearXboxProfileCache(context)
}

// Mirrors xcloudCache.ts's clearXcloudData(): keeps starTitles (the user's
// own starred-title list), drops everything else (the cached catalog, which
// a settings change like force_region_ip/preferred_game_language can make
// stale -- e.g. the catalog for a different region/language).
fun clearXcloudData(context: Context) {
    ensureMmkvInitialized(context)
    val current = parseJsonObjectOrNull(NativeSettingsStore.nativeGetXcloudDataJson())
    val starTitles = current?.get("starTitles")?.takeIf { it.isJsonArray } ?: JsonArray()
    val next = JsonObject()
    next.add("starTitles", starTitles)
    NativeSettingsStore.nativeSetXcloudDataJson(next.toString())
}
