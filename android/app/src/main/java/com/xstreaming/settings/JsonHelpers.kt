package com.xstreaming.settings

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * Null-safe, type-checked JSON reads shared by AccountStatus.kt and
 * GfnDeviceAuthClient.kt -- both parse duck-typed JSON blobs written by
 * JS (MMKV values, or NVIDIA's own HTTP responses) where a key can be
 * absent, JSON null, or simply not the type expected, and Gson's own
 * unchecked-cast accessors (getAsJsonObject/asString/...) throw instead of
 * degrading the way a JS `obj?.key` read would. One shared implementation
 * here, not two independently-maintained copies that could silently drift
 * apart on a future fix.
 */
internal fun parseJsonObjectOrNull(raw: String?): JsonObject? {
    if (raw.isNullOrEmpty()) {
        return null
    }
    return try {
        JsonParser.parseString(raw).takeIf { it.isJsonObject }?.asJsonObject
    } catch (e: Exception) {
        null
    }
}

internal fun stringOrNull(obj: JsonObject?, key: String): String? =
    obj?.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString

internal fun longOrNull(obj: JsonObject?, key: String): Long? =
    obj?.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asLong

internal fun intOrNull(obj: JsonObject?, key: String): Int? =
    obj?.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asInt

// Gson's JsonObject.getAsJsonObject throws (an unchecked cast) if the key
// holds a JSON null or any non-object value, rather than returning null the
// way a duck-typed JS `obj?.key` read degrades -- guarded here so a future
// schema change (or a hand-edited store) can't crash on it; every nested
// object lookup in this package goes through this, not the raw Gson method.
internal fun objOrNull(obj: JsonObject?, key: String): JsonObject? =
    try {
        obj?.getAsJsonObject(key)
    } catch (e: Exception) {
        null
    }
