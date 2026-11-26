package com.xstreaming.catalog

import com.google.gson.Gson
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.io.IOException

private val gson = Gson()

/**
 * Kotlin port of entities/catalog-title/api/storePrice.ts's DisplayCatalog
 * fetch (CATALOG_URL) -- Microsoft Store's public (no-auth) per-product
 * pricing/rating/detail JSON, keyed by "big id" (Store id).
 *
 * Unlike the catalog-title fetchers ported so far, storePrice.ts's own
 * extraction (extractPrice/extractRating/extractCategory/extractDetails/
 * extractInGamePass/extractBasics), formatting (formatPrice/discountPercent/
 * isSaleForDisplay/formatSaleEnd) and orchestration (chunking, capped
 * concurrency, retry-with-backoff) logic stays in JS: it's pure, synchronous
 * field extraction with no I/O, already covered by its own dedicated unit
 * tests (gamePass.test.ts, storeGenres.test.ts, fetchPricesGamePass.test.ts),
 * and some of it (getPrice/getRating/formatPrice/discountPercent/
 * isSaleForDisplay/formatSaleEnd/deriveMarketLanguage) is display-layer code
 * other JS modules call directly. Only the network request itself -- the
 * actual I/O storePrice.ts used axios for -- moves here.
 */
object DisplayCatalogClient {
    private const val CATALOG_URL = "https://displaycatalog.mp.microsoft.com/v7.0/products"

    // Same request shape and 15s timeout as both axios.get call sites in
    // storePrice.ts used (bulk -- bigIds a comma-joined chunk -- and
    // single-id, in fetchTitleDetails), so one method serves both;
    // CatalogHttpClient's shared 15s connect/read/callTimeout matches the
    // `timeout: 15000` those axios calls passed explicitly.
    fun fetchProducts(bigIds: String, market: String, language: String): List<Any?> {
        val url = CATALOG_URL.toHttpUrl().newBuilder()
            .addQueryParameter("bigIds", bigIds)
            .addQueryParameter("market", market)
            .addQueryParameter("languages", language)
            .addQueryParameter("fieldsTemplate", "details")
            .build()
        val request = Request.Builder()
            .url(url)
            .header("MS-CV", "0")
            .build()
        CatalogHttpClient.instance.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                // Matches axios's default throw-on-non-2xx -- both JS call
                // sites already catch this (per chunk, or per retry attempt).
                throw IOException("DisplayCatalog fetch failed (${response.code})")
            }
            val body = response.body?.string() ?: return emptyList()
            val parsed = gson.fromJson(body, Any::class.java)
            @Suppress("UNCHECKED_CAST")
            return (parsed as? Map<String, Any?>)?.get("Products") as? List<Any?> ?: emptyList()
        }
    }
}
