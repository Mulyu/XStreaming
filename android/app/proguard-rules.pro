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