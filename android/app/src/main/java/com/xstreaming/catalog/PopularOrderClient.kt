package com.xstreaming.catalog

import kotlinx.coroutines.delay
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import com.google.gson.JsonParser

/**
 * Kotlin port of entities/catalog-title/api/popularOrder.ts's
 * fetchPopularOrder -- the "Most popular on cloud" Game Pass sigls
 * collection; no auth required. Caching (model/priceCache.ts's
 * getFreshPopularOrder/savePopularOrder) stays in JS; this is fetch +
 * parse + retry only.
 */
object PopularOrderClient {
    // The "Most popular on cloud" Game Pass collection -- the same list
    // that backs https://play.xbox.com/gallery/popular. sigls returns an
    // ordered list of product ids (by usage/popularity); no auth required.
    private const val POPULAR_SIGL_ID = "6a589fa0-d493-472b-8e20-3813699d7056"
    private const val SIGLS_URL = "https://catalog.gamepass.com/sigls/v2"

    // Returns the ordered ids, or null on a transient failure (so the
    // caller can tell "this market has no list" from "the request failed"
    // and only retry the latter).
    private fun fetchOnce(market: String, language: String): List<String>? {
        return try {
            val url = SIGLS_URL.toHttpUrl().newBuilder()
                .addQueryParameter("id", POPULAR_SIGL_ID)
                .addQueryParameter("market", market)
                .addQueryParameter("language", language)
                .addQueryParameter("deviceFamily", "Windows.Xbox")
                .build()
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            CatalogHttpClient.instance.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    // A non-2xx (e.g. a transient 5xx) is a failure to
                    // retry, not a legitimately empty list -- even if its
                    // body happens to parse as JSON.
                    return null
                }
                val body = response.body?.string() ?: return null
                val element = JsonParser.parseString(body)
                if (!element.isJsonArray) {
                    // Unexpected shape (e.g. a 200 error body) -- treat as
                    // a failure to retry, not a legitimately empty list.
                    return null
                }
                // The leading collection-metadata element ({siglId,
                // title,...}) has no `id`, so filtering on a string id
                // drops it without assuming its position.
                element.asJsonArray
                    .mapNotNull { entry ->
                        entry.takeIf { it.isJsonObject }?.asJsonObject
                            ?.get("id")?.takeIf { it.isJsonPrimitive }?.asString
                    }
                    .filter { it.isNotEmpty() }
                    .map { it.uppercase() }
            }
        } catch (e: Exception) {
            null
        }
    }

    // Fetch the popularity-ordered Store ids (uppercased), retrying with
    // backoff so a single transient failure doesn't disable the sort.
    // Returns the list (which may be a legitimately empty []) on success,
    // or null when every attempt failed -- so the caller can
    // negative-cache an empty market but retry a real failure.
    suspend fun fetchOrder(
        market: String = "US",
        language: String = "en-US",
        attempts: Int = 3,
        baseDelayMs: Long = 10000,
    ): List<String>? {
        for (attempt in 0 until attempts) {
            val order = fetchOnce(market, language)
            if (order != null) {
                return order
            }
            if (attempt < attempts - 1) {
                delay(baseDelayMs * (1L shl attempt))
            }
        }
        return null
    }
}
