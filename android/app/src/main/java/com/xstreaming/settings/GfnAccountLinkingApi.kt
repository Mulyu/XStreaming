package com.xstreaming.settings

import kotlinx.coroutines.CancellationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Kotlin port of features/gfn-session/api/accountLinking.ts's GfnStoreSyncResult. */
data class GfnStoreSyncResult(val ok: Boolean, val status: Int)

/**
 * Kotlin port of features/gfn-session/api/accountLinking.ts --
 * GeForce NOW's Account Linking Service (ALS), a different NVIDIA backend
 * from CloudMatch/GraphQL. A POST to /v1/sync/<platform> is exactly what
 * the "Refresh" button on play.geforcenow.com/mall/#/layout/settings/
 * connections does per linked store: it tells NVIDIA to re-check that
 * store's library right now instead of waiting for its own periodic
 * background sync. See that TS file's own comment for how the header
 * scheme (a plain `Bearer <idToken>`, not CloudMatch's `GFNJWT <token>`)
 * and the uppercase platform segment (GFN's own store id, e.g. "STEAM")
 * were confirmed live against a real account.
 */
object GfnAccountLinkingApi {
    private const val ALS_BASE_URL = "https://als.geforcenow.com/v1"

    // The official client's own accountLinking.defaultSyncWaitInterval --
    // how long to wait after a successful sync request before the library
    // might actually reflect it (the sync itself runs on NVIDIA's side, not
    // synchronously in this response).
    const val STORE_SYNC_WAIT_MS = 10_000L

    suspend fun syncGfnStoreConnection(platform: String, idToken: String): GfnStoreSyncResult {
        return try {
            val body = "{}".toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$ALS_BASE_URL/sync/$platform")
                .header("Authorization", "Bearer $idToken")
                .header("Content-Type", "application/json")
                .post(body)
                .build()
            val (code, _) = GfnHttp.execute(request)
            // true only for the 202 Accepted the web client itself treats
            // as success, matching the TS version exactly.
            GfnStoreSyncResult(ok = code == 202, status = code)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            GfnStoreSyncResult(ok = false, status = 0)
        }
    }
}
