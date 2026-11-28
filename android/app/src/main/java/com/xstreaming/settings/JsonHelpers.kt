package com.xstreaming.settings

import android.util.Base64
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

// Decodes a JWT's payload segment (base64url, manually padded since JWTs
// omit the trailing '='s Android's own decoder requires) into its claims
// object. Shared by AccountStatus.kt's nameFromJwt() and GfnTokenRefresh.kt's
// expiry/subject reads -- one implementation of the same base64url-padding
// dance, not two.
internal fun decodeJwtClaims(token: String?): JsonObject? {
    if (token.isNullOrEmpty()) {
        return null
    }
    val payload = token.split(".").getOrNull(1) ?: return null
    return try {
        val padded = payload + "=".repeat((4 - payload.length % 4) % 4)
        val decoded = Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
        parseJsonObjectOrNull(String(decoded, Charsets.UTF_8))
    } catch (e: Exception) {
        null
    }
}
