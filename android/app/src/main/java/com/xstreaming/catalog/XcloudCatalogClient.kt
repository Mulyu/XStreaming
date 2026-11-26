package com.xstreaming.catalog

import com.google.gson.Gson
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.Collator
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

private val JSON_MEDIA_TYPE = "application/json".toMediaType()
private val gson = Gson()

// Chunks of displaycatalog.mp.microsoft.com lookups in flight at once --
// matches entities/catalog-title/api/xcloudCatalogApi.ts's
// RELEASE_DATE_CONCURRENCY.
private const val RELEASE_DATE_CONCURRENCY = 3

/**
 * Kotlin port of entities/catalog-title/api/xcloudCatalogApi.ts's
 * XcloudCatalogApi class. These endpoints return loosely-shaped JSON (no
 * fixed schema -- the TS version is typed `any` throughout), so responses
 * are parsed with Gson's untyped `fromJson(body, Any::class.java)`, which
 * -- like JS's own JSON.parse -- yields plain Map/List/String/Double/
 * Boolean/null; CatalogXcloudModule passes these straight to
 * Arguments.makeNativeMap/makeNativeArray rather than this file needing its
 * own JSON<->WritableMap converter.
 *
 * host/gsToken are passed in per-call (already resolved by the JS caller
 * from the xCloudToken object, same pattern GFN's native WebRTC module
 * uses) rather than held as client-side session state, since every method
 * here is an independent request/response call with no persistent
 * connection or callback state to guard (unlike GfnWebRtcClient/
 * XcloudWebRtcClient's PeerConnection, nothing here needs a
 * connectGeneration-style stale-callback guard).
 */
object XcloudCatalogClient {
    // The TS version's filters/guards here are plain JS truthiness checks
    // (`item.titleId || item.XCloudTitleId`, `title.details.productId`),
    // not null checks -- an empty string or 0 is falsy in JS and must be
    // treated the same way here, or an entry the original code dropped
    // would now be kept.
    private fun isTruthy(value: Any?): Boolean = when (value) {
        null -> false
        is String -> value.isNotEmpty()
        is Boolean -> value
        is Double -> value != 0.0 && !value.isNaN()
        is Float -> value != 0f && !value.isNaN()
        is Number -> value.toDouble() != 0.0
        else -> true
    }

    private fun httpClient(callTimeoutSeconds: Long? = null): OkHttpClient {
        val base = CatalogHttpClient.instance
        return if (callTimeoutSeconds == null) {
            base
        } else {
            base.newBuilder().callTimeout(callTimeoutSeconds, TimeUnit.SECONDS).build()
        }
    }

    // GET https://cdn.jsdelivr.net/.../titles.json, 30s timeout (explicit in
    // the TS version, unlike the other methods here which fall back to
    // CatalogHttpClient's shared 15s callTimeout). Resolves res.data.Products
    // on an exact HTTP 200, else [] -- matches the TS version's `res.status
    // === 200` check (not just 2xx) and its catch-all empty-array fallback.
    fun getOfficialTitles(): List<Any?> {
        return try {
            val request = Request.Builder()
                .url("https://cdn.jsdelivr.net/gh/Geocld/XStreaming@main/titles.json")
                .build()
            httpClient(30).newCall(request).execute().use { response ->
                if (response.code != 200) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val parsed = gson.fromJson(body, Any::class.java)
                @Suppress("UNCHECKED_CAST")
                (parsed as? Map<String, Any?>)?.get("Products") as? List<Any?> ?: emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    // POST catalog.gamepass.com/v3/products -- hydrates a product-id list
    // with Game Pass catalog metadata, then merges in v2TitleMap's fields
    // (taking priority on key collision, matching the TS spread order
    // `{productId, ...products[key], ...v2TitleMap[key]}`), sorts by
    // ProductTitle, and drops entries with neither titleId nor
    // XCloudTitleId. Never throws -- an exception or missing
    // res.data.Products both resolve [].
    fun getCatalogGames(
        prods: List<Any?>,
        v2TitleMap: Map<String, Any?>,
        lang: String,
    ): List<Map<String, Any?>> {
        return try {
            val productsBody = mapOf("Products" to prods)
            val url = "https://catalog.gamepass.com/v3/products".toHttpUrl().newBuilder()
                .addQueryParameter("market", "US")
                .addQueryParameter("language", lang)
                .addQueryParameter("hydration", "RemoteLowJade0")
                .build()
            val request = Request.Builder()
                .url(url)
                .post(gson.toJson(productsBody).toRequestBody(JSON_MEDIA_TYPE))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("ms-cv", "0")
                .header("calling-app-name", "Xbox Cloud Gaming Web")
                .header("calling-app-version", "24.17.63")
                .build()
            // The original axios call had no timeout at all -- unlike
            // getOfficialTitles/getReleaseDates, which already had an
            // explicit 30s cap. Rather than silently shrinking that to
            // CatalogHttpClient's shared 15s default (too tight for a
            // request that can carry the user's whole entitled list plus
            // the entire official-titles list), bound it to the same 30s
            // the other explicit-timeout methods already use.
            httpClient(30).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val parsed = gson.fromJson(body, Any::class.java)
                @Suppress("UNCHECKED_CAST")
                val products = (parsed as? Map<String, Any?>)
                    ?.get("Products") as? Map<String, Any?> ?: return emptyList()

                val merged = products.entries.map { (key, value) ->
                    @Suppress("UNCHECKED_CAST")
                    val productFields = value as? Map<String, Any?> ?: emptyMap()
                    @Suppress("UNCHECKED_CAST")
                    val overrideFields = v2TitleMap[key] as? Map<String, Any?>
                    val entry = LinkedHashMap<String, Any?>()
                    entry["productId"] = key
                    entry.putAll(productFields)
                    if (overrideFields != null) {
                        entry.putAll(overrideFields)
                    }
                    entry
                }

                val collator = Collator.getInstance()
                merged
                    .sortedWith(compareBy(collator) { it["ProductTitle"] as? String ?: "" })
                    .filter { isTruthy(it["titleId"]) || isTruthy(it["XCloudTitleId"]) }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    // Orchestration, not a direct network call: hydrates `titles` (each
    // expected to carry details.productId) via getCatalogGames, then
    // separately hydrates getOfficialTitles()'s own id list the same way,
    // concatenates both results, sorts by ProductTitle, and dedups by
    // ProductTitle keeping the first occurrence -- same steps and order as
    // the TS version.
    suspend fun getGamePassProducts(titles: List<Any?>, lang: String): List<Map<String, Any?>> {
        val productIdQueue = mutableListOf<String>()
        val v2TitleMap = LinkedHashMap<String, Any?>()
        titles.forEach { title ->
            @Suppress("UNCHECKED_CAST")
            val titleMap = title as? Map<String, Any?> ?: return@forEach
            @Suppress("UNCHECKED_CAST")
            val details = titleMap["details"] as? Map<String, Any?> ?: return@forEach
            // The TS version used productId as an object key (coercing any
            // truthy value to a string), so a numeric id was still kept --
            // match that instead of requiring it to already be a String.
            // Falsy (empty string, 0) is dropped, same as `title.details &&
            // title.details.productId` in the TS version.
            val productIdRaw = details["productId"]
            if (!isTruthy(productIdRaw)) return@forEach
            val productId = productIdRaw as? String ?: productIdRaw.toString()
            productIdQueue.add(productId)
            v2TitleMap[productId] = titleMap
        }

        // getOfficialTitles() and the productIdQueue hydration are
        // independent network calls (titles2 below is the only one that
        // depends on officialTitles) -- run them concurrently instead of
        // back-to-back, same coroutineScope+async shape already used by
        // fetchPrices/getReleaseDates in this package.
        val (officialTitles, titles1) = coroutineScope {
            val officialTitlesDeferred = async { getOfficialTitles() }
            val titles1Deferred = async { getCatalogGames(productIdQueue, v2TitleMap, lang) }
            officialTitlesDeferred.await() to titles1Deferred.await()
        }
        val titles2 = getCatalogGames(officialTitles, v2TitleMap, lang)

        val collator = Collator.getInstance()
        val merged = (titles1 + titles2)
            .sortedWith(compareBy(collator) { it["ProductTitle"] as? String ?: "" })
        val seen = HashSet<String>()
        return merged.filter { seen.add(it["ProductTitle"] as? String ?: "") }
    }

    // GET {host}/v2/titles, Bearer auth. Resolves the raw parsed response
    // body on success -- callers (loadXcloudCatalog.ts) depend on this
    // being a non-array object ({results: [...]}) specifically, to tell a
    // real (zero-length) empty catalog apart from a failed request, which
    // resolves a bare [] instead. Preserve this success/failure *shape*
    // asymmetry exactly -- it's load-bearing, not an accident to clean up.
    fun getTitles(host: String, gsToken: String): Any {
        return try {
            val request = Request.Builder()
                .url("$host/v2/titles")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $gsToken")
                .build()
            httpClient().newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList<Any?>()
                val body = response.body?.string() ?: return emptyList<Any?>()
                gson.fromJson(body, Any::class.java) ?: emptyList<Any?>()
            }
        } catch (e: Exception) {
            emptyList<Any?>()
        }
    }

    // GET catalog.gamepass.com/sigls/v2 ("recently added" Game Pass
    // collection), no auth. Resolves the raw response body on success, []
    // on any failure.
    fun getNewTitles(): Any {
        return try {
            val url = "https://catalog.gamepass.com/sigls/v2".toHttpUrl().newBuilder()
                .addQueryParameter("id", "f13cf6b4-57e6-4459-89df-6aec18cf0538")
                .addQueryParameter("market", "US")
                .addQueryParameter("language", "en-US")
                .build()
            val request = Request.Builder().url(url).build()
            httpClient().newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList<Any?>()
                val body = response.body?.string() ?: return emptyList<Any?>()
                gson.fromJson(body, Any::class.java) ?: emptyList<Any?>()
            }
        } catch (e: Exception) {
            emptyList<Any?>()
        }
    }

    // Enrich productIds (bigIds) with their displaycatalog original release
    // date -- batched 40 at a time, RELEASE_DATE_CONCURRENCY chunks in
    // flight, 30s per-chunk timeout (explicit in the TS version, like
    // getOfficialTitles). Best-effort: a failed/malformed chunk is skipped
    // entirely, matching the TS version's bare `catch {}`.
    suspend fun getReleaseDates(productIds: List<String>): Map<String, String> {
        val unique = productIds.filter { it.isNotEmpty() }.distinct()
        if (unique.isEmpty()) {
            return emptyMap()
        }
        val chunks = unique.chunked(40)
        val result = ConcurrentHashMap<String, String>()
        val semaphore = Semaphore(RELEASE_DATE_CONCURRENCY)
        coroutineScope {
            // coroutineScope itself suspends until every child launch{}
            // below completes, so there's no need to separately collect
            // and join the jobs.
            chunks.forEach { chunk ->
                launch {
                    semaphore.acquire()
                    try {
                        fetchReleaseDateChunk(chunk, result)
                    } finally {
                        semaphore.release()
                    }
                }
            }
        }
        return result
    }

    private fun fetchReleaseDateChunk(chunk: List<String>, result: MutableMap<String, String>) {
        try {
            val url = "https://displaycatalog.mp.microsoft.com/v7.0/products".toHttpUrl()
                .newBuilder()
                .addQueryParameter("bigIds", chunk.joinToString(","))
                .addQueryParameter("market", "US")
                .addQueryParameter("languages", "en-US")
                .addQueryParameter("fieldsTemplate", "details")
                .build()
            val request = Request.Builder()
                .url(url)
                .header("MS-CV", "0")
                .build()
            httpClient(30).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return
                val body = response.body?.string() ?: return
                val parsed = gson.fromJson(body, Any::class.java)
                @Suppress("UNCHECKED_CAST")
                val products = (parsed as? Map<String, Any?>)
                    ?.get("Products") as? List<Any?> ?: return
                for (p in products) {
                    @Suppress("UNCHECKED_CAST")
                    val product = p as? Map<String, Any?> ?: continue
                    val id = product["ProductId"] as? String ?: continue
                    @Suppress("UNCHECKED_CAST")
                    val marketProperties = product["MarketProperties"] as? List<Any?>
                    @Suppress("UNCHECKED_CAST")
                    val date = (marketProperties?.firstOrNull() as? Map<String, Any?>)
                        ?.get("OriginalReleaseDate") as? String
                    if (date != null) {
                        result[id] = date
                    }
                }
            }
        } catch (e: Exception) {
            // One failed chunk must not fail the rest -- matches the TS
            // version's own bare catch.
        }
    }

    // GET {host}/v2/titles/mru?mr=25, Bearer auth. Raw response on success,
    // [] on failure.
    fun getRecentTitles(host: String, gsToken: String): Any {
        return try {
            val request = Request.Builder()
                .url("$host/v2/titles/mru?mr=25")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $gsToken")
                .build()
            httpClient().newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList<Any?>()
                val body = response.body?.string() ?: return emptyList<Any?>()
                gson.fromJson(body, Any::class.java) ?: emptyList<Any?>()
            }
        } catch (e: Exception) {
            emptyList<Any?>()
        }
    }

    // POST {host}/v2/titles with an alternateIds lookup body, Bearer auth.
    // Resolves res.data (or [] if the body is null/empty) on success, []
    // on failure.
    fun getAlternateIds(host: String, gsToken: String, id: String): Any {
        return try {
            val requestBody = mapOf(
                "alternateIdType" to "productId",
                "alternateIds" to listOf(id),
            )
            val request = Request.Builder()
                .url("$host/v2/titles")
                .post(gson.toJson(requestBody).toRequestBody(JSON_MEDIA_TYPE))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $gsToken")
                .build()
            httpClient().newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList<Any?>()
                val body = response.body?.string() ?: return emptyList<Any?>()
                gson.fromJson(body, Any::class.java) ?: emptyList<Any?>()
            }
        } catch (e: Exception) {
            emptyList<Any?>()
        }
    }

    // Static device-info blob xCloud's web client sends on this call --
    // byte-for-byte the same fields as the TS version's (hardcoded, not
    // derived from the real device).
    private val DEVICE_INFO_JSON = gson.toJson(
        mapOf(
            "appInfo" to mapOf(
                "env" to mapOf(
                    "clientAppId" to "www.xbox.com",
                    "clientAppType" to "browser",
                    "clientAppVersion" to "26.1.97",
                    "clientSdkVersion" to "10.3.7",
                    "httpEnvironment" to "prod",
                    "sdkInstallId" to "",
                ),
            ),
            "dev" to mapOf(
                "hw" to mapOf(
                    "make" to "Microsoft",
                    "model" to "unknown",
                    "sdktype" to "web",
                ),
                "os" to mapOf(
                    "name" to "windows",
                    "ver" to "22631.2715",
                    "platform" to "desktop",
                ),
                "displayInfo" to mapOf(
                    "dimensions" to mapOf(
                        "widthInPixels" to 1920,
                        "heightInPixels" to 1080,
                    ),
                    "pixelDensity" to mapOf(
                        "dpiX" to 1,
                        "dpiY" to 1,
                    ),
                ),
                "browser" to mapOf(
                    "browserName" to "chrome",
                    "browserVersion" to "130.0",
                ),
            ),
        ),
    )

    // GET {host}/v6/servers/home?mr=50, Bearer auth + X-MS-Device-Info.
    // Resolves res.data.results when present, else [] -- on success or
    // failure alike.
    fun getConsoles(host: String, gsToken: String): List<Any?> {
        return try {
            val request = Request.Builder()
                .url("$host/v6/servers/home?mr=50")
                .header("Content-Type", "application/json")
                .header("X-MS-Device-Info", DEVICE_INFO_JSON)
                .header("Authorization", "Bearer $gsToken")
                .build()
            httpClient().newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val parsed = gson.fromJson(body, Any::class.java)
                @Suppress("UNCHECKED_CAST")
                (parsed as? Map<String, Any?>)?.get("results") as? List<Any?> ?: emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
