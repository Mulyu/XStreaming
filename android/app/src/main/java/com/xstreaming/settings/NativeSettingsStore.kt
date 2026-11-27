package com.xstreaming.settings

/**
 * Raw JNI bridge to the exact MMKV instance JS's shared/lib/mmkv.ts already
 * uses (id "mmkv.default"), added via patches/react-native-mmkv+2.12.2.patch.
 * See that patch's own comment for why this is safe (same compiled
 * reactnativemmkv.so, same process-wide MMKV::mmkvWithID singleton registry)
 * and why a second, independently-added MMKV dependency would NOT be.
 *
 * Only the "user.settings" key is exposed -- that's the one JSON blob
 * shared/lib/settings.ts's getSettings/saveSettings read and write as a
 * whole, so a Kotlin-only settings UI needs nothing more granular than get/
 * set on that one key.
 */
object NativeSettingsStore {
    init {
        System.loadLibrary("reactnativemmkv")
    }

    external fun nativeGetUserSettingsJson(): String?
    external fun nativeSetUserSettingsJson(json: String)
}
