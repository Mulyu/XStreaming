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
 * set on that one key. "gfn.tokens"/"user.tokenstore"/"xbox.profile.cache"
 * are read-only: the account-status rows in the Compose Settings UI only
 * show what's already signed in (see AccountStatus.kt), they don't drive
 * sign-in/sign-out, so there's no native setter for any of these three.
 */
object NativeSettingsStore {
    init {
        System.loadLibrary("reactnativemmkv")
    }

    external fun nativeGetUserSettingsJson(): String?
    external fun nativeSetUserSettingsJson(json: String)

    external fun nativeGetGfnTokensJson(): String?
    external fun nativeGetXboxTokenStoreJson(): String?
    external fun nativeGetXboxProfileCacheJson(): String?

    // No-op if MMKV is already initialized (by this call or by JS's own
    // `new MMKV()`) -- see AppSettings.kt's ensureMmkvInitialized() for why
    // a native-only caller can't just assume JS got there first.
    external fun nativeEnsureMmkvInitialized(rootDirectory: String)
}
