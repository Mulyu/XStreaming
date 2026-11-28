package com.xstreaming.settings

import com.google.gson.JsonObject
import kotlinx.coroutines.CancellationException
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** Kotlin port of features/gfn-session/api/queueStatus.ts's GfnQueueStatus. */
data class GfnQueueStatus(val waiting: Int, val etaMinutes: Int)

/**
 * Kotlin port of features/gfn-session/api/queueStatus.ts. How many people
 * are waiting for a GeForce NOW server, before any session is started.
 * NVIDIA exposes the queue position only once a session exists, so this
 * reads the community-run PrintedWaste tracker instead: one entry per
 * data-centre zone (the same id as the account's VPC, e.g. "NP-TYO-01"),
 * with the queue length seen there. Unofficial, so it can disappear or go
 * stale; every failure reads as "no figure" rather than an error, same as
 * the TS version.
 */
object GfnQueueStatusApi {
    private const val QUEUE_URL = "https://api.printedwaste.com/gfn/queue/"
    private const val QUEUE_TIMEOUT_SECONDS = 8L

    // A zone nobody has sampled for this long is not showing the present
    // queue (the tracker keeps entries from long-dead zones around).
    private const val MAX_AGE_SECONDS = 60 * 60L

    // The tracker's own fallback formula, also usable directly against
    // GFN's own real-time queue position (not ported here -- see
    // queueStatus.ts's own comment on why).
    private const val SECONDS_PER_PERSON = 6
    private const val BASE_WAIT_SECONDS = 120

    private val httpClient = GfnHttp.client.newBuilder().callTimeout(QUEUE_TIMEOUT_SECONDS, TimeUnit.SECONDS).build()

    private fun estimateQueueEtaMinutes(waiting: Int): Int =
        maxOf(1, Math.ceil((waiting * SECONDS_PER_PERSON + BASE_WAIT_SECONDS) / 60.0).toInt())

    // Pure part, for tests: pick the zone's entry out of the tracker's
    // response and turn it into a figure, or null when it is missing,
    // malformed or old.
    internal fun parseQueueStatus(payload: JsonObject?, zoneId: String, nowSeconds: Long): GfnQueueStatus? {
        val data = objOrNull(payload, "data")
        val entry = objOrNull(data, zoneId)
        val waiting = intOrNull(entry, "QueuePosition")
        val updated = longOrNull(entry, "Last Updated")
        if (waiting == null || waiting < 0 || updated == null || nowSeconds - updated > MAX_AGE_SECONDS) {
            return null
        }
        val etaMs = longOrNull(entry, "eta")
        val etaMinutes = if (etaMs != null && etaMs > 0) {
            maxOf(1, Math.ceil(etaMs / 1000.0 / 60.0).toInt())
        } else {
            estimateQueueEtaMinutes(waiting)
        }
        return GfnQueueStatus(waiting, etaMinutes)
    }

    suspend fun fetchGfnQueueStatus(zoneId: String): GfnQueueStatus? {
        return try {
            val request = Request.Builder().url(QUEUE_URL).header("Accept", "application/json").get().build()
            val (code, body) = GfnHttp.execute(request, httpClient)
            if (code !in 200..299) {
                return null
            }
            val json = parseJsonObjectOrNull(body) ?: return null
            parseQueueStatus(json, zoneId, System.currentTimeMillis() / 1000)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
}
