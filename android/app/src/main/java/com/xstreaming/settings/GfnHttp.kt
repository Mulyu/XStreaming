package com.xstreaming.settings

import com.xstreaming.catalog.CatalogHttpClient
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * HTTP plumbing shared by every GFN API caller in this package
 * (GfnDeviceAuthClient's device-code sign-in, GfnTokenRefresh's token
 * refresh, and later GFN API callers) -- static headers impersonating
 * NVIDIA's own Steam Deck browser client, and the suspendCancellableCoroutine
 * + enqueue()/call.cancel() pattern that makes a request actually abort when
 * its caller's coroutine is cancelled. Extracted out of GfnDeviceAuthClient.kt
 * (which had all of this inline before any other caller needed it) rather
 * than duplicated into each new caller.
 */
internal object GfnHttp {
    const val FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8"

    // Shared by GfnDeviceAuthClient.kt (sign-in) and GfnTokenRefresh.kt
    // (refresh) -- one definition instead of two copies that could drift
    // apart on a future change.
    const val TOKEN_ENDPOINT = "https://login.nvidia.com/token"

    // NVIDIA's Steam Deck OAuth client -- its device-code flow needs no
    // client secret and grants the streaming scopes needed here; the
    // refresh/client-token grants reuse the same client id.
    const val STEAM_DECK_CLIENT_ID = "q61ddeJrVt7O90Nl-P-N7I36yctih4Ml6FyXLrb6j-U"

    private const val GFN_PLAY_ORIGIN = "https://play.geforcenow.com"
    private const val GFN_PLAY_REFERER = "https://play.geforcenow.com/"
    private const val STEAM_DECK_USER_AGENT =
        "Mozilla/5.0 (X11; Linux x86_64; Steam Deck) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/128.0.0.0 Safari/537.36"

    // CatalogHttpClient.instance already has a 15s callTimeout, the same
    // every caller here needs -- no reason to rebuild it with an identical
    // one.
    val client get() = CatalogHttpClient.instance

    fun requestBuilder(contentType: String? = null): Request.Builder {
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
    // cancellation-aware -- cancelling the coroutine wouldn't actually stop
    // it, it would just keep running on its IO thread until it finishes or
    // times out. invokeOnCancellation here cancels the real underlying
    // OkHttp Call immediately instead.
    //
    // [client] defaults to the shared 15s-timeout instance above, but a
    // caller whose own reference source uses a different timeout (e.g.
    // GfnCloudMatchApi's 30s, matching session.ts's CLOUDMATCH_TIMEOUT_MS)
    // passes its own derived client instead.
    suspend fun execute(request: Request, client: OkHttpClient = this.client): Pair<Int, String> =
        suspendCancellableCoroutine { continuation ->
            val call = client.newCall(request)
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
}
