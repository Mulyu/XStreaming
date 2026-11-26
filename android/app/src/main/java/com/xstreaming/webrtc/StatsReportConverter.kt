package com.xstreaming.webrtc

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.webrtc.RTCStats
import org.webrtc.RTCStatsReport

/**
 * Converts org.webrtc's RTCStatsReport into the same shape the performance
 * overlay's parsing code (GfnStreamAdapter.getStreamState(), the xCloud
 * native client's getStreamState()/getAudioVolume()) already expects --
 * written originally against react-native-webrtc's RTCStatsReport, which
 * (like a browser's) is forEach-able over plain stat objects keyed by the
 * W3C webrtc-stats member names. Without this, both native clients'
 * getStats() resolved only report.toString() -- a diagnostic string the
 * overlay's `typeof stats.forEach !== 'function'` guard correctly refused
 * to parse, so it showed nothing.
 *
 * One field needs an explicit unit conversion, not just a passthrough:
 * RTCStats.getTimestampUs() is microseconds; the overlay's bitrate/jitter
 * math (ported from the browser-spec-based TS client) assumes
 * stat.timestamp is in milliseconds, matching DOMHighResTimeStamp.
 */
object StatsReportConverter {
    fun toWritableArray(report: RTCStatsReport?): WritableArray {
        val array = Arguments.createArray()
        if (report == null) {
            return array
        }
        for (stats in report.statsMap.values) {
            array.pushMap(toWritableMap(stats))
        }
        return array
    }

    private fun toWritableMap(stats: RTCStats): WritableMap {
        val map = Arguments.createMap()
        map.putString("id", stats.id)
        map.putString("type", stats.type)
        map.putDouble("timestamp", stats.timestampUs / 1000.0)
        for ((key, value) in stats.members) {
            putMember(map, key, value)
        }
        return map
    }

    private fun putMember(map: WritableMap, key: String, value: Any?) {
        when (value) {
            null -> map.putNull(key)
            is Boolean -> map.putBoolean(key, value)
            is Double -> map.putDouble(key, value)
            is Float -> map.putDouble(key, value.toDouble())
            is Number -> map.putDouble(key, value.toDouble())
            is String -> map.putString(key, value)
            is BooleanArray -> {
                val arr = Arguments.createArray()
                value.forEach { arr.pushBoolean(it) }
                map.putArray(key, arr)
            }
            // Kotlin's primitive arrays (IntArray, LongArray, ...) are
            // distinct types from Array<Int>/Array<Long> and don't match
            // the `is Array<*>` branch below -- a JNI stats bridge like
            // libwebrtc's commonly returns primitive arrays for a
            // sequence<T> member, so these need their own branches or
            // they'd fall through to the generic toString() case (producing
            // an opaque "[D@hashcode" string instead of real values).
            is IntArray -> {
                val arr = Arguments.createArray()
                value.forEach { arr.pushDouble(it.toDouble()) }
                map.putArray(key, arr)
            }
            is LongArray -> {
                val arr = Arguments.createArray()
                value.forEach { arr.pushDouble(it.toDouble()) }
                map.putArray(key, arr)
            }
            is DoubleArray -> {
                val arr = Arguments.createArray()
                value.forEach { arr.pushDouble(it) }
                map.putArray(key, arr)
            }
            is FloatArray -> {
                val arr = Arguments.createArray()
                value.forEach { arr.pushDouble(it.toDouble()) }
                map.putArray(key, arr)
            }
            is Array<*> -> {
                // Only a handful of stat fields are ever arrays (e.g.
                // codec ids) and none the overlay reads today -- stringify
                // elements generically rather than special-casing types
                // nothing currently needs.
                val arr = Arguments.createArray()
                value.forEach {
                    when (it) {
                        is Number -> arr.pushDouble(it.toDouble())
                        is Boolean -> arr.pushBoolean(it)
                        else -> arr.pushString(it.toString())
                    }
                }
                map.putArray(key, arr)
            }
            else -> map.putString(key, value.toString())
        }
    }
}
