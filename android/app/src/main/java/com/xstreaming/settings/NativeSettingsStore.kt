package com.xstreaming.settings

/**
 * Raw JNI bridge to the exact MMKV instance JS's shared/lib/mmkv.ts already
 * uses (id "mmkv.default"), added via patches/react-native-mmkv+2.12.2.patch.
 * See that patch's own comment for why this is safe (same compiled
 * reactnativemmkv.so, same process-wide MMKV::mmkvWithID singleton registry)
 * and why a second, independently-added MMKV dependency would NOT be.
 *
 * The "user.settings" key is read/write -- that's the one JSON blob
 * shared/lib/settings.ts's getSettings/saveSettings read and write as a
 * whole, so a Kotlin-only settings UI needs nothing more granular than get/
 * set on that one key. "gfn.tokens"/"gfn.deviceId" are also read/write, for
 * GfnDeviceAuthClient.kt's native GFN sign-in flow. "user.tokenstore"/
 * "xbox.profile.cache" are read-only: the Xbox account row only shows
 * what's already signed in (see AccountStatus.kt) -- Xbox's own sign-in/
 * sign-out needs XAL/MSAL and an interactive WebView, a separate later
 * phase, so there's no native setter for either of those two.
 */
object NativeSettingsStore {
    init {
        System.loadLibrary("reactnativemmkv")
    }

    external fun nativeGetUserSettingsJson(): String?
    external fun nativeSetUserSettingsJson(json: String)

    external fun nativeGetGfnTokensJson(): String?
    external fun nativeSetGfnTokensJson(json: String)
    external fun nativeClearGfnTokens()
    external fun nativeGetGfnDeviceId(): String?
    external fun nativeSetGfnDeviceId(deviceId: String)

    external fun nativeGetXboxTokenStoreJson(): String?
    external fun nativeGetXboxProfileCacheJson(): String?

    // Session caches a settings change (e.g. force_region_ip) invalidates --
    // see SessionCaches.kt, which composes these the same way the JS
    // originals call each other.
    external fun nativeClearStreamToken()
    external fun nativeClearWebToken()
    external fun nativeClearXboxProfileCache()
    external fun nativeClearXboxMembership()
    external fun nativeGetXcloudDataJson(): String?
    external fun nativeSetXcloudDataJson(json: String)

    // No-op if MMKV is already initialized (by this call or by JS's own
    // `new MMKV()`) -- see AppSettings.kt's ensureMmkvInitialized() for why
    // a native-only caller can't just assume JS got there first.
    external fun nativeEnsureMmkvInitialized(rootDirectory: String)
}
