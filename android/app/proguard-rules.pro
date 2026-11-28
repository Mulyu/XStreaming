# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-dontwarn dalvik.**
-dontwarn com.tencent.smtt.**

-keep class com.tencent.smtt.** {
 *;
}

-keep class com.tencent.tbs.** {
 *;
}

# GfnWebRtcModule.connect() deserializes the session JSON Gson-reflectively
# into these data classes (field names must match the JSON keys JS sends) --
# nothing else in the app does this today, so there's no pre-existing rule
# covering it.
-keep class com.xstreaming.gfn.GfnSessionInfo { *; }
-keep class com.xstreaming.gfn.GfnIceServerInfo { *; }
-keep class com.xstreaming.gfn.GfnStreamSettingsInfo { *; }

# XcloudWebRtcModule's bridge methods (setGamepadState/queuePointerInput/
# setIceCandidates) deserialize JSON Gson-reflectively into these DTOs, same
# reason as the GFN ones above.
-keep class com.xstreaming.xcloud.GamepadFrameDto { *; }
-keep class com.xstreaming.xcloud.PointerEventDto { *; }
-keep class com.xstreaming.xcloud.IceCandidateDto { *; }

# AppSettings.kt's Settings/DisplayOptions serialize Gson-reflectively to/
# from the exact JSON shape shared/lib/settings.ts's getSettings/saveSettings
# read and write (field names, via @SerializedName, must match those JSON
# keys) -- an unobfuscated field name here isn't optional the way it might
# be for an app-internal-only DTO, since the JS side reads the same stored
# blob by the same hardcoded key strings.
-keep class com.xstreaming.settings.Settings { *; }
-keep class com.xstreaming.settings.DisplayOptions { *; }

# GfnDeviceAuthClient.kt's GfnTokens serializes Gson-reflectively to the
# exact JSON shape src/entities/gfn-account/model/auth.ts's GfnTokens type
# reads back from the same "gfn.tokens" MMKV key -- same reasoning as
# Settings/DisplayOptions above.
-keep class com.xstreaming.settings.GfnTokens { *; }