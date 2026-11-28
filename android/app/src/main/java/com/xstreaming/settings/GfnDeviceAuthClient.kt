package com.xstreaming.settings

import com.google.gson.Gson
import com.xstreaming.catalog.CatalogHttpClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.FormBody
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.security.SecureRandom
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Kotlin port of auth.ts's GfnDeviceChallenge. */
data class GfnDeviceChallenge(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val verificationUriComplete: String,
    val expiresAt: Long,
    val intervalSeconds: Int,
)

/**
 * Kotlin port of auth.ts's GfnTokens. clientToken is captured when NVIDIA's
 * device-code token-exchange response happens to include one (same as
 * auth.ts's exchangeDeviceCode() reading `payload.client_token`).
 * clientTokenExpiresAt stays null, though: that field tracks the SEPARATE
 * client_token endpoint call's own, independent expiry
 * (ensureClientToken() in the TS source, not ported here -- see
 * GfnDeviceAuthClient's own doc comment for why), which is not the same
 * thing as whatever expiry the device-code response's client_token (if
 * any) might carry.
 */
data class GfnTokens(
    val accessToken: String,
    val refreshToken: String? = null,
    val idToken: String? = null,
    val clientToken: String? = null,
    val clientTokenExpiresAt: Long? = null,
    val expiresAt: Long,
    val authClientId: String,
)

class GfnDeviceAuthCancelled : Exception("cancelled")
class GfnDeviceAuthFailed(message: String) : Exception(message)

// stringOrNull/longOrNull/intOrNull/parseJsonObjectOrNull are shared with
// AccountStatus.kt -- see JsonHelpers.kt. Those take a JsonObject? receiver
// (not a JsonObject.stringOrNull(key) extension the way this file first
// had them), so every call site below passes the object explicitly.

/**
 * Kotlin port of src/entities/gfn-account/model/auth.ts's device-code
 * (QR/code) sign-in flow: requestDeviceAuthorization() + pollForTokens()
 * only -- NOT the token-refresh/client-token-bootstrap machinery that same
 * file also has (ensureClientToken/getValidTokens/refreshWithBestMethod).
 * Those exist to keep a token valid across the API calls GFN's catalog/
 * session/playtime features make; none of those are called from Kotlin
 * yet, so a freshly signed-in token set is used as-is -- AccountStatus.kt's
 * "signed in" check is presence-only and unaffected by whether these
 * tokens eventually expire, same as it already was before this phase.
 *
 * No request signing of any kind (unlike Xbox's XAL/XSTS): every call here
 * is plain form-urlencoded JSON over HTTPS with static headers impersonating
 * GFN's own Steam Deck browser client.
 *
 * Only ever called from within an already-running SettingsActivity (the
 * user tapping "sign in"), by which point MMKV is already guaranteed
 * initialized (its own onCreate already read settings) -- so, unlike
 * AccountStatus.kt's functions, nothing here calls ensureMmkvInitialized().
 */
object GfnDeviceAuthClient {
    private val gson = Gson()

    private const val DEVICE_AUTHORIZE_ENDPOINT = "https://login.nvidia.com/device/authorize"
    private const val TOKEN_ENDPOINT = "https://login.nvidia.com/token"

    // NVIDIA's Steam Deck OAuth client -- its device-code flow needs no
    // client secret and grants the streaming scopes needed here.
    private const val STEAM_DECK_CLIENT_ID = "q61ddeJrVt7O90Nl-P-N7I36yctih4Ml6FyXLrb6j-U"
    private const val SCOPES = "openid consent email tk_client age"
    private const val DEFAULT_IDP_ID = "PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg"
    private const val STEAM_DECK_USER_AGENT =
        "Mozilla/5.0 (X11; Linux x86_64; Steam Deck) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/128.0.0.0 Safari/537.36"
    private const val GFN_PLAY_ORIGIN = "https://play.geforcenow.com"
    private const val GFN_PLAY_REFERER = "https://play.geforcenow.com/"
    private const val FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8"

    // CatalogHttpClient.instance already has a 15s callTimeout, the same
    // this needs -- no reason to rebuild it with an identical one.
    private val httpClient get() = CatalogHttpClient.instance

    private fun authRequestBuilder(contentType: String? = null): Request.Builder {
        val builder = Request.Builder()
            .header("Accept", "application/json, text/plain, */*")
            .header("Origin", GFN_PLAY_ORIGIN)
            .header("Referer", GFN_PLAY_REFERER)
            .header("User-Agent", STEAM_DECK_USER_AGENT)
        if (contentType != null) {
            builder.header("Content-Type", contentType)
        }
        return builder
    }

    // Uses enqueue()/call.cancel() rather than execute() inside
    // withContext(Dispatchers.IO): a blocking execute() isn't itself
    // cancellation-aware -- cancelling the coroutine (e.g. the user taps
    // Cancel on GfnSignInDialog mid-request) wouldn't actually stop it, it
    // would just keep running on its IO thread until it finishes or times
    // out. invokeOnCancellation here cancels the real underlying OkHttp
    // Call immediately instead.
    private suspend fun execute(request: Request): Pair<Int, String> =
        suspendCancellableCoroutine { continuation ->
            val call = httpClient.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    val result = response.use { it.code to (it.body?.string() ?: "") }
                    continuation.resume(result)
                }

                override fun onFailure(call: Call, e: IOException) {
                    // NOT call.isCanceled(): OkHttp itself calls
                    // call.cancel() internally when its own callTimeout
                    // fires, before invoking onFailure -- checking that
                    // would wrongly suppress a real timeout failure too,
                    // leaving the coroutine suspended forever. Checking the
                    // continuation's own state instead correctly
                    // distinguishes "the user cancelled" (continuation no
                    // longer active, nothing to resume) from "OkHttp failed
                    // or timed out" (still active, must propagate).
                    if (continuation.isActive) {
                        continuation.resumeWithException(e)
                    }
                }
            })
        }

    // Mirrors getDeviceId(): a stable, opaque per-device identifier
    // NVIDIA's device-authorize call requires, persisted once in MMKV (via
    // NativeSettingsStore, not shared/lib/mmkv.ts's own "gfn.deviceId" key
    // -- same key, no JS/RN bridge involved).
    private fun getOrCreateDeviceId(): String {
        val existing = NativeSettingsStore.nativeGetGfnDeviceId()
        if (existing != null && Regex("^[0-9a-f]{16,}$").matches(existing)) {
            return existing
        }
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val id = bytes.joinToString("") { "%02x".format(it) }
        NativeSettingsStore.nativeSetGfnDeviceId(id)
        return id
    }

    suspend fun requestDeviceAuthorization(): GfnDeviceChallenge {
        val deviceId = getOrCreateDeviceId()
        val body = FormBody.Builder()
            .add("client_id", STEAM_DECK_CLIENT_ID)
            .add("scope", SCOPES)
            .add("device_id", deviceId)
            .add("display_name", "AnyStreaming")
            .add("idp_id", DEFAULT_IDP_ID)
            .build()
        val request = authRequestBuilder(FORM_CONTENT_TYPE)
            .url(DEVICE_AUTHORIZE_ENDPOINT)
            .header("x-device-id", deviceId)
            .header("nv-client-id", STEAM_DECK_CLIENT_ID)
            .header("nv-client-streamer", "WEBRTC")
            .header("nv-client-type", "BROWSER")
            .header("nv-client-platform-name", "browser")
            .header("nv-browser-type", "CHROME")
            .header("nv-device-os", "STEAMOS")
            .header("nv-device-type", "CONSOLE")
            .header("nv-device-model", "STEAMDECK")
            .header("nv-device-make", "VALVE")
            .post(body)
            .build()

        val (code, bodyText) = execute(request)
        if (code !in 200..299) {
            throw GfnDeviceAuthFailed("GFN device authorization failed ($code): ${bodyText.take(300)}")
        }
        val json = parseJsonObjectOrNull(bodyText)
            ?: throw GfnDeviceAuthFailed("GFN device authorization response was not JSON")
        val deviceCode = stringOrNull(json, "device_code")
        val userCode = stringOrNull(json, "user_code")
        val verificationUri = stringOrNull(json, "verification_uri")
        val verificationUriComplete = stringOrNull(json, "verification_uri_complete")
        if (deviceCode.isNullOrEmpty() || userCode.isNullOrEmpty() ||
            verificationUri.isNullOrEmpty() || verificationUriComplete.isNullOrEmpty()
        ) {
            throw GfnDeviceAuthFailed("GFN device authorization response was incomplete")
        }
        val expiresIn = longOrNull(json, "expires_in") ?: 600L
        val interval = intOrNull(json, "interval") ?: 5
        return GfnDeviceChallenge(
            deviceCode = deviceCode,
            userCode = userCode,
            verificationUri = verificationUri,
            verificationUriComplete = verificationUriComplete,
            expiresAt = System.currentTimeMillis() + expiresIn * 1000,
            intervalSeconds = maxOf(1, interval),
        )
    }

    private class ExchangeResult(val tokens: GfnTokens?, val error: String?, val errorDescription: String?)

    private suspend fun exchangeDeviceCode(deviceCode: String): ExchangeResult {
        val body = FormBody.Builder()
            .add("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
            .add("device_code", deviceCode)
            .add("client_id", STEAM_DECK_CLIENT_ID)
            .build()
        val request = authRequestBuilder(FORM_CONTENT_TYPE).url(TOKEN_ENDPOINT).post(body).build()
        val (code, bodyText) = execute(request)
        val json = parseJsonObjectOrNull(bodyText)

        if (code !in 200..299) {
            return ExchangeResult(
                tokens = null,
                error = stringOrNull(json, "error") ?: "device_token_exchange_failed",
                errorDescription = stringOrNull(json, "error_description") ?: "Device token exchange failed ($code)",
            )
        }
        val accessToken = stringOrNull(json, "access_token")
        if (accessToken.isNullOrEmpty()) {
            return ExchangeResult(
                tokens = null,
                error = "invalid_token_response",
                errorDescription = "GFN token exchange response was missing access_token",
            )
        }
        val expiresIn = longOrNull(json, "expires_in") ?: 86400L
        val tokens = GfnTokens(
            accessToken = accessToken,
            refreshToken = stringOrNull(json, "refresh_token"),
            idToken = stringOrNull(json, "id_token"),
            clientToken = stringOrNull(json, "client_token"),
            expiresAt = System.currentTimeMillis() + expiresIn * 1000,
            authClientId = STEAM_DECK_CLIENT_ID,
        )
        return ExchangeResult(tokens, null, null)
    }

    // Mirrors pollForTokens(): checks shouldCancel both before and after
    // each delay, keeps polling on authorization_pending, lengthens the
    // interval by 5s on slow_down, and treats any other error as terminal.
    suspend fun pollForTokens(challenge: GfnDeviceChallenge, shouldCancel: () -> Boolean): GfnTokens {
        var intervalMs = challenge.intervalSeconds * 1000L
        while (System.currentTimeMillis() < challenge.expiresAt) {
            if (shouldCancel()) {
                throw GfnDeviceAuthCancelled()
            }
            delay(intervalMs)
            if (shouldCancel()) {
                throw GfnDeviceAuthCancelled()
            }
            val result = exchangeDeviceCode(challenge.deviceCode)
            if (result.tokens != null) {
                NativeSettingsStore.nativeSetGfnTokensJson(gson.toJson(result.tokens))
                return result.tokens
            }
            when (result.error) {
                "authorization_pending" -> continue
                "slow_down" -> {
                    intervalMs += 5000
                    continue
                }
                else -> throw GfnDeviceAuthFailed(
                    result.errorDescription ?: result.error ?: "GFN sign-in failed",
                )
            }
        }
        throw GfnDeviceAuthFailed("expired_token")
    }

    fun signOut() {
        NativeSettingsStore.nativeClearGfnTokens()
    }
}
