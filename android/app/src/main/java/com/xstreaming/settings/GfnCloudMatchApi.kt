package com.xstreaming.settings

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Request
import java.net.URLEncoder
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Kotlin port of session.ts's GfnRegionOption. */
data class GfnRegionOption(val name: String, val url: String)

/** The region list and the caller's own VPC id -- see fetchGfnServerInfo(). */
data class GfnServerInfo(val regions: List<GfnRegionOption>, val vpcId: String?)

// Mirrors catalog-title's gfnLocale.ts: GFN's public catalog JSON and its
// authenticated GraphQL/MES APIs use two different spellings of "the same"
// locale (gfnpc-ja-JP.json vs. the GraphQL/MES languageCode's ja_JP) --
// fetchGfnSubscription() needs the latter. Only the app's own supported
// locales are mapped (same table), falling back to English like the TS
// version does.
private val GFN_LOCALE_SLUGS = mapOf(
    "en" to "en-US",
    "de" to "de-DE",
    "es" to "es-ES",
    "pt" to "pt-BR",
    "ko" to "ko-KR",
    "ja" to "ja-JP",
    "zh" to "zh-CN",
    "zht" to "zh-TW",
)

// e.g. "ja_JP" -- the app's locale code (Settings.locale) converted to the
// underscore form GFN's GraphQL/MES APIs expect for their
// `language`/`locale`/`languageCode` fields.
fun gfnGraphqlLocale(appLocale: String): String =
    (GFN_LOCALE_SLUGS[appLocale] ?: "en-US").replace("-", "_")

/**
 * Kotlin port of session.ts's GfnSubscriptionInfo -- only the fields the
 * Settings screen's playtime row actually reads (membershipTier,
 * remainingHours, isUnlimited), not the full set the TS type carries
 * (allottedHours/purchasedHours/rolledOverHours/usedHours/totalHours/
 * currentSpanEndDateTime are unused by any Kotlin caller so far).
 */
data class GfnSubscriptionInfo(
    val membershipTier: String,
    val remainingHours: Double,
    val isUnlimited: Boolean,
)

/**
 * Kotlin port of features/gfn-session/api/session.ts's region/VPC/
 * subscription lookups ONLY: fetchGfnRegions()/fetchGfnVpcId()/
 * fetchGfnSubscription(). That file's session create/poll/teardown/launch
 * machinery (CloudMatch WebRTC session negotiation for an actual native GFN
 * stream) is a separate, much larger undertaking, out of scope here -- this
 * only needs the read-only metadata calls the Settings screen's GFN lane
 * shows (the region picker, the remaining-playtime figure).
 */
object GfnCloudMatchApi {
    private const val DEFAULT_BASE_URL = "https://prod.cloudmatchbeta.nvidiagrid.net"

    // Client identity as OpenNOW's current CloudMatch requests send it, same
    // as session.ts's own constants.
    private const val GFN_USER_AGENT =
        "GFN-PC/30.0 (Windows NT 10.0) BifrostClientSDK/4.9 (38495286)"
    private const val GFN_CLIENT_VERSION = "2.0.87.131"
    private const val GFN_CLIENT_ID = "ec7e38d4-03af-4b58-b131-cfb0495903ab"
    private const val GFN_PLAY_ORIGIN = "https://play.geforcenow.com"
    private const val GFN_PLAY_REFERER = "https://play.geforcenow.com/"

    // Mirrors fetchCloudMatch()'s own retry policy for GET requests -- a
    // transient blip here previously fell straight back to a less useful
    // default/empty result for the rest of this screen visit.
    private val RETRY_STATUSES = setOf(408, 425, 429, 500, 502, 503, 504)
    private val RETRY_DELAYS_MS = listOf(250L, 750L)
    private const val RETRIES = 2

    // session.ts's own CLOUDMATCH_TIMEOUT_MS -- longer than GfnHttp's shared
    // 15s client (sized for NVIDIA's own login/token endpoints), since a
    // CloudMatch GET can legitimately take longer. Derived from GfnHttp's
    // client (same connection pool/dispatcher), not rebuilt from scratch.
    private val httpClient = GfnHttp.client.newBuilder().callTimeout(30, TimeUnit.SECONDS).build()

    // Mirrors getStableDeviceId(): a device id kept stable in MMKV, SEPARATE
    // from GfnDeviceAuthClient's own "gfn.deviceId" (NVIDIA's device-code
    // sign-in flow) -- session.ts's own CLOUDMATCH_DEVICE_ID_KEY is a
    // different key from auth.ts's DEVICE_ID_KEY too.
    //
    // Guarded by a Mutex: two concurrent first calls (e.g. fetchGfnRegions
    // and fetchGfnVpcId both launched around the same time on a cold start)
    // could otherwise both see no stored id and each mint and send a
    // DIFFERENT UUID before either write lands, undermining the "stable
    // device id" invariant this function exists for.
    private val deviceIdLock = Mutex()

    private suspend fun getOrCreateDeviceId(context: Context): String = deviceIdLock.withLock {
        ensureMmkvInitialized(context)
        val existing = NativeSettingsStore.nativeGetGfnCloudMatchDeviceId()
        if (!existing.isNullOrEmpty()) {
            existing
        } else {
            val id = UUID.randomUUID().toString()
            NativeSettingsStore.nativeSetGfnCloudMatchDeviceId(id)
            id
        }
    }

    // Mirrors buildCloudMatchHeaders(). Takes the already-resolved device id
    // (not a Context to re-derive it) so a retried request reuses the SAME
    // id instead of re-resolving it (a JNI/MMKV round-trip) on every attempt.
    private fun requestBuilder(deviceId: String, token: String, includeOrigin: Boolean): Request.Builder {
        val builder = Request.Builder()
            .header("User-Agent", GFN_USER_AGENT)
            .header("Authorization", "GFNJWT $token")
            .header("Content-Type", "text/plain")
            .header("nv-client-id", GFN_CLIENT_ID)
            .header("nv-client-streamer", "WEBRTC")
            .header("nv-client-type", "BROWSER")
            .header("nv-client-version", GFN_CLIENT_VERSION)
            .header("x-device-id", deviceId)
            .header("nv-device-os", "WINDOWS")
            .header("nv-device-type", "DESKTOP")
            .header("nv-device-make", "UNKNOWN")
            .header("nv-device-model", "UNKNOWN")
            .header("x-nv-client-identity", GFN_USER_AGENT)
        if (includeOrigin) {
            builder.header("Origin", GFN_PLAY_ORIGIN).header("Referer", GFN_PLAY_REFERER)
        }
        return builder
    }

    // Mirrors fetchCloudMatch()'s retry loop for GET -- retries both a
    // transient bad status AND a thrown network exception (a timeout/
    // connection reset from GfnHttp.execute() itself), not just the former.
    private suspend fun getWithRetry(context: Context, url: String, token: String): Pair<Int, String> {
        val deviceId = getOrCreateDeviceId(context)
        var attempt = 0
        while (true) {
            val request = requestBuilder(deviceId, token, includeOrigin = false).url(url).get().build()
            val result = try {
                GfnHttp.execute(request, httpClient)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (attempt < RETRIES) {
                    delay(RETRY_DELAYS_MS[minOf(attempt, RETRY_DELAYS_MS.size - 1)])
                    attempt += 1
                    continue
                }
                throw e
            }
            if (attempt < RETRIES && result.first in RETRY_STATUSES) {
                delay(RETRY_DELAYS_MS[minOf(attempt, RETRY_DELAYS_MS.size - 1)])
                attempt += 1
                continue
            }
            return result
        }
    }

    // Mirrors fetchGfnRegions()/fetchGfnVpcId(): the TS originals each
    // independently re-fetch the SAME /v2/serverInfo payload (one for the
    // metadata endpoint resolveRegionBase() -- session create/launch, not
    // ported here -- also reads to auto-pick the nearest region; the other
    // for the caller's current VPC id, requestStatus.serverId, which
    // fetchGfnSubscription() needs). Merged into one call+parse here: there
    // is no reason for the Settings screen's GFN lane to make two full
    // HTTPS round trips (each with its own retry loop) for data that comes
    // back in a single response.
    suspend fun fetchGfnServerInfo(context: Context, token: String): GfnServerInfo {
        return try {
            val (code, body) = getWithRetry(context, "$DEFAULT_BASE_URL/v2/serverInfo", token)
            if (code !in 200..299) {
                return GfnServerInfo(regions = emptyList(), vpcId = null)
            }
            val json = parseJsonObjectOrNull(body) ?: return GfnServerInfo(regions = emptyList(), vpcId = null)
            val metaData = json.get("metaData")?.takeIf { it.isJsonArray }?.asJsonArray
            val regions = metaData
                ?.mapNotNull { it.takeIf { e -> e.isJsonObject }?.asJsonObject }
                ?.mapNotNull { entry ->
                    val key = stringOrNull(entry, "key")
                    val value = stringOrNull(entry, "value")
                    if (key != null && value != null && value.startsWith("https://") && !key.startsWith("gfn-")) {
                        GfnRegionOption(key, value.trimEnd('/'))
                    } else {
                        null
                    }
                }
                ?.sortedBy { it.name }
                ?: emptyList()
            val vpcId = stringOrNull(objOrNull(json, "requestStatus"), "serverId")
            GfnServerInfo(regions, vpcId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            GfnServerInfo(regions = emptyList(), vpcId = null)
        }
    }

    // Mirrors fetchGfnSubscription(): NVIDIA's plan/quota API (MES) --
    // reports remaining playtime for the current billing span. [vpcId] is
    // nullable (the caller's own fetchGfnVpcId() result, passed straight
    // through) so this one fallback constant -- the same common European
    // VPC session.ts falls back to when that call can't resolve one -- has
    // a single definition, not a second copy at the call site.
    suspend fun fetchGfnSubscription(
        context: Context,
        token: String,
        userId: String,
        languageCode: String,
        vpcId: String? = null,
    ): GfnSubscriptionInfo? {
        return try {
            val resolvedVpcId = vpcId ?: "NP-AMS-08"
            fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
            val url = "https://mes.geforcenow.com/v4/subscriptions" +
                "?serviceName=gfn_pc&languageCode=${enc(languageCode)}&vpcId=${enc(resolvedVpcId)}&userId=${enc(userId)}"
            val (code, body) = getWithRetry(context, url, token)
            if (code !in 200..299) {
                return null
            }
            val json = parseJsonObjectOrNull(body) ?: return null

            // Mirrors toMinutes(): a finite number, or a string that parses
            // to one, else 0 -- matching the TS version's own
            // Number.isFinite() guard (rejecting NaN/Infinity, not just a
            // non-numeric value).
            fun minutesOf(key: String): Double {
                val el = json.get(key) ?: return 0.0
                if (!el.isJsonPrimitive) {
                    return 0.0
                }
                val primitive = el.asJsonPrimitive
                val value = when {
                    primitive.isNumber -> primitive.asDouble
                    primitive.isString -> primitive.asString.toDoubleOrNull()
                    else -> null
                }
                return if (value != null && value.isFinite()) value else 0.0
            }

            val remaining = minutesOf("remainingTimeInMinutes")
            GfnSubscriptionInfo(
                membershipTier = stringOrNull(json, "membershipTier") ?: "FREE",
                remainingHours = remaining / 60.0,
                isUnlimited = stringOrNull(json, "subType") == "UNLIMITED",
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
}
