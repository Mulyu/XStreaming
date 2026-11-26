package com.xstreaming.catalog

import com.google.gson.JsonParser
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

data class SteamPriceInfo(
    val currencyCode: String,
    val initial: Long, // minor units (e.g. cents), pre-discount
    val final: Long, // minor units, current buyable price
    val discountPercent: Int,
)

/**
 * Kotlin port of entities/catalog-title/api/steamPrice.ts's
 * fetchSteamPrices -- Steam's public (no key, no auth) Store API batch
 * price lookup. Caching (model/steamPriceCache.ts) stays in JS; this is
 * fetch + parse only, called with an already-deduplicated id list.
 */
object SteamPriceClient {
    // Steam's public Store API. No key, no auth -- confirmed live: a single
    // call accepts a comma-joined batch of appids and returns each one's
    // price_overview (which already reflects any active discount).
    private const val APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"

    // Undocumented, but batching keeps well under the community-reported
    // ~200 req/5min per-IP throttle. 100 ids per call (with price_overview
    // only) was confirmed live (100 ids -> 98 results), so a full GFN
    // catalog is a few dozen requests instead of hundreds.
    private const val BATCH_SIZE = 100

    // How many chunk requests run at once -- firing every chunk in parallel
    // would mean hundreds of simultaneous requests, well past that same
    // throttle.
    private const val CHUNK_CONCURRENCY = 3

    // Fetch Steam store prices for a batch of app ids. Never throws -- a
    // failed batch, or a free-to-play/unlisted app within an otherwise
    // successful one, is simply omitted from the result.
    suspend fun fetchPrices(
        appIds: List<String>,
        cc: String = "US",
        language: String = "english",
    ): Map<String, SteamPriceInfo> {
        val ids = appIds.filter { it.isNotEmpty() }.distinct()
        val result = ConcurrentHashMap<String, SteamPriceInfo>()
        if (ids.isEmpty()) {
            return result
        }

        val chunks = ids.chunked(BATCH_SIZE)
        // Capped concurrency instead of launching every chunk at once --
        // bounds how many chunk requests are ever in flight together, same
        // as the TS version's runPool(chunks, CHUNK_CONCURRENCY, ...).
        val semaphore = Semaphore(CHUNK_CONCURRENCY)
        coroutineScope {
            val jobs = chunks.map { chunk ->
                launch {
                    semaphore.acquire()
                    try {
                        fetchChunk(chunk, cc, language, result)
                    } finally {
                        semaphore.release()
                    }
                }
            }
            jobs.forEach { it.join() }
        }
        return result
    }

    private fun fetchChunk(
        chunk: List<String>,
        cc: String,
        language: String,
        result: MutableMap<String, SteamPriceInfo>,
    ) {
        try {
            val url = APPDETAILS_URL.toHttpUrl().newBuilder()
                .addQueryParameter("appids", chunk.joinToString(","))
                .addQueryParameter("cc", cc)
                .addQueryParameter("l", language)
                .addQueryParameter("filters", "price_overview")
                .build()
            val request = Request.Builder().url(url).build()
            CatalogHttpClient.instance.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    // Matches the TS version's axios call, which throws by
                    // default on any non-2xx -- caught by the per-chunk
                    // try/catch below, same as here.
                    return
                }
                val body = response.body?.string() ?: return
                val root = JsonParser.parseString(body).asJsonObject
                for (id in chunk) {
                    if (!root.has(id)) continue
                    val entry = root.getAsJsonObject(id) ?: continue
                    val success = entry.get("success")?.asBoolean ?: false
                    val overview = entry.getAsJsonObject("data")
                        ?.getAsJsonObject("price_overview")
                    if (success && overview != null) {
                        val initial = overview.get("initial")?.asLong
                            ?: overview.get("final")?.asLong ?: 0L
                        result[id] = SteamPriceInfo(
                            currencyCode = overview.get("currency")?.asString ?: "",
                            initial = initial,
                            final = overview.get("final")?.asLong ?: 0L,
                            discountPercent = overview.get("discount_percent")?.asInt ?: 0,
                        )
                    }
                }
            }
        } catch (e: IOException) {
            // Matches the TS version's own per-chunk try/catch -- one
            // failed chunk must not fail the whole batch.
        } catch (e: Exception) {
            // Malformed/unexpected response body -- same treatment.
        }
    }
}
