package com.xstreaming.catalog

import com.google.gson.Gson
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit

private val gson = Gson()
private val JSON_MEDIA_TYPE = "application/json".toMediaType()

/**
 * Kotlin port of entities/catalog-title/api/gfnCatalog.ts's authenticated
 * GeForce NOW GraphQL catalog -- owned library, full browse catalog,
 * catalog-wide rank, per-app details, and linked stores. Unlike
 * gfnPublicGames.ts's public (anonymous) list, every query here needs a
 * signed-in token and GFN's own "virtual PC id" (vpcId), resolved once per
 * token via NVIDIA's serverInfo endpoint and cached in memory (see
 * cachedVpcId below) -- not persisted, same lifetime as the JS module-level
 * cache it replaces.
 *
 * normalizeTitle/mergeOwnedGames stay in JS: normalizeTitle is a pure,
 * widely-used synchronous string helper called from many unrelated,
 * non-network call sites throughout the app (App.tsx, unifiedCatalog.ts,
 * storeLogic.ts), so forcing it through an async native bridge would be a
 * real regression, not a win. mergeOwnedGames is a pure synchronous
 * combinator over two already-resolved GfnGame[] arrays from two different
 * sources (this client's own owned-games result, and gfnPublicGames.ts's
 * entirely separate native module) -- it never touches the network, so
 * there's nothing here for it to gain either. The MMKV read/write caching
 * (getFreshOwnedGames/getCachedFullCatalog/etc.) also stays in JS, per the
 * same MMKV-sharing-risk reasoning as every earlier catalog-title phase.
 */
object GfnCatalogClient {
    private const val GRAPHQL_URL = "https://games.geforce.com/graphql"
    private const val SERVER_INFO_URL = "https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo"
    private const val LCARS_CLIENT_ID = "ec7e38d4-03af-4b58-b131-cfb0495903ab"
    private const val GFN_CLIENT_VERSION = "2.0.80.173"
    private const val GFN_PLAY_ORIGIN = "https://play.geforcenow.com"
    private const val GFN_PLAY_REFERER = "https://play.geforcenow.com/"
    private const val GFN_USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173"

    // GraphQL POST calls had NO explicit timeout at all in the original
    // fetch() calls (only the serverInfo call did) -- an unbounded call is a
    // latent hang risk, not a behavior worth preserving as-is, so this adds
    // the same kind of explicit, generous cap the earlier catalog-title
    // phases added wherever one was missing (see XcloudCatalogClient's
    // getCatalogGames). 30s matches that same precedent for a
    // larger/paginated payload.
    private const val GRAPHQL_TIMEOUT_SECONDS = 30L
    // Explicit in the original (SERVER_INFO_TIMEOUT_MS), kept as-is.
    private const val SERVER_INFO_TIMEOUT_SECONDS = 15L

    private fun httpClient(timeoutSeconds: Long): OkHttpClient =
        CatalogHttpClient.instance.newBuilder().callTimeout(timeoutSeconds, TimeUnit.SECONDS).build()

    private val deviceHeaders = mapOf(
        "nv-device-os" to "WINDOWS",
        "nv-device-type" to "DESKTOP",
        "nv-device-make" to "UNKNOWN",
        "nv-device-model" to "UNKNOWN",
    )

    private fun graphqlRequestBuilder(token: String): Request.Builder {
        val builder = Request.Builder().url(GRAPHQL_URL)
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json")
            .header("Origin", GFN_PLAY_ORIGIN)
            .header("Referer", GFN_PLAY_REFERER)
            .header("Authorization", "GFNJWT $token")
            .header("nv-client-id", LCARS_CLIENT_ID)
            .header("nv-client-type", "NATIVE")
            .header("nv-client-version", GFN_CLIENT_VERSION)
            .header("nv-client-streamer", "NVIDIA-CLASSIC")
            .header("nv-browser-type", "CHROME")
            .header("User-Agent", GFN_USER_AGENT)
        deviceHeaders.forEach { (k, v) -> builder.header(k, v) }
        return builder
    }

    private fun graphqlRequest(token: String, query: String, variables: Map<String, Any?>): Request {
        val body = gson.toJson(mapOf("query" to query, "variables" to variables))
        return graphqlRequestBuilder(token).post(body.toRequestBody(JSON_MEDIA_TYPE)).build()
    }

    private fun graphqlRequestNoVars(token: String, query: String): Request {
        val body = gson.toJson(mapOf("query" to query))
        return graphqlRequestBuilder(token).post(body.toRequestBody(JSON_MEDIA_TYPE)).build()
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseJsonObject(body: String): Map<String, Any?>? =
        gson.fromJson(body, Any::class.java) as? Map<String, Any?>

    // --- vpcId resolution -------------------------------------------------

    // token -> vpcId. Not @Synchronized: a race just means an extra
    // redundant serverInfo fetch, same risk profile as the JS module-level
    // variable it replaces (also unsynchronized against concurrent callers).
    @Volatile
    private var cachedVpcId: Pair<String, String>? = null

    private fun fetchServerInfoOnce(token: String): String? {
        return try {
            val request = Request.Builder()
                .url(SERVER_INFO_URL)
                .header("Accept", "application/json")
                .header("Authorization", "GFNJWT $token")
                .header("nv-client-id", LCARS_CLIENT_ID)
                .header("nv-client-type", "NATIVE")
                .header("nv-client-version", GFN_CLIENT_VERSION)
                .header("nv-client-streamer", "NVIDIA-CLASSIC")
                .header("User-Agent", GFN_USER_AGENT)
                .apply { deviceHeaders.forEach { (k, v) -> header(k, v) } }
                .build()
            httpClient(SERVER_INFO_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val parsed = parseJsonObject(body) ?: return null
                @Suppress("UNCHECKED_CAST")
                val requestStatus = parsed["requestStatus"] as? Map<String, Any?>
                val serverId = requestStatus?.get("serverId") as? String
                if (!serverId.isNullOrEmpty()) serverId else null
            }
        } catch (e: Exception) {
            null
        }
    }

    private const val VPC_ID_RETRIES = 2
    private const val VPC_ID_RETRY_DELAY_MS = 1000L

    private suspend fun getVpcId(token: String): String? {
        cachedVpcId?.let { (cachedToken, vpcId) -> if (cachedToken == token) return vpcId }
        for (attempt in 0..VPC_ID_RETRIES) {
            val serverId = fetchServerInfoOnce(token)
            if (serverId != null) {
                cachedVpcId = token to serverId
                return serverId
            }
            if (attempt < VPC_ID_RETRIES) {
                delay(VPC_ID_RETRY_DELAY_MS * (attempt + 1))
            }
        }
        return null
    }

    // --- shared row-mapping helpers ---------------------------------------

    // Matches the TS version's /^\d+$/ exactly (ASCII digits only) --
    // Kotlin's Char.isDigit() is Unicode-aware and would also accept e.g.
    // fullwidth or Arabic-indic digit characters that \d does not.
    private val ASCII_DIGITS_ONLY = Regex("^[0-9]+$")
    private fun isNumeric(v: String?): Boolean = !v.isNullOrEmpty() && ASCII_DIGITS_ONLY.matches(v)

    private fun optimizeImage(url: String, width: Int = 460): String =
        if (url.contains("img.nvidiagrid.net")) "$url;f=webp;w=$width" else url

    private val IMAGE_KEYS = listOf("HERO_IMAGE", "TV_BANNER", "KEY_ART", "GAME_BOX_ART")

    @Suppress("UNCHECKED_CAST")
    private fun firstImage(images: Map<String, Any?>?): String? {
        if (images == null) return null
        for (key in IMAGE_KEYS) {
            val raw = images[key]
            val value = when (raw) {
                is List<*> -> raw.firstOrNull() as? String
                is String -> raw
                else -> null
            }
            val trimmed = value?.trim()
            if (!trimmed.isNullOrEmpty()) {
                return optimizeImage(trimmed)
            }
        }
        return null
    }

    // Mirrors gfnPublicGames.ts's steamAppIdFromUrl (and its own Kotlin
    // port in GfnPublicGamesClient.kt) -- a leading digit run right after
    // "/app/", not a whole-remainder match.
    private fun steamAppIdFromUrl(steamUrl: String?): String? {
        if (steamUrl.isNullOrEmpty()) return null
        val after = steamUrl.split("/app/").getOrNull(1) ?: return null
        val match = Regex("^(\\d+)").find(after) ?: return null
        return match.groupValues[1]
    }

    private val OWNED_LIBRARY_STATUSES = setOf("MANUAL", "PLATFORM_SYNC", "IN_LIBRARY")
    private fun isOwnedLibraryStatus(status: String): Boolean = OWNED_LIBRARY_STATUSES.contains(status)

    private fun isConfirmedPlayable(gfn: Map<String, Any?>?): Boolean {
        val playType = gfn?.get("playType") as? String ?: return false
        return playType.uppercase().contains("FREE")
    }

    @Suppress("UNCHECKED_CAST")
    private fun variantSubscription(variant: Map<String, Any?>): String? {
        val library = (variant["gfn"] as? Map<String, Any?>)?.get("library") as? Map<String, Any?>
        val sub = library?.get("subscription") as? String
        return if (!sub.isNullOrEmpty() && sub != "NONE") sub else null
    }

    @Suppress("UNCHECKED_CAST")
    private fun variantStatus(variant: Map<String, Any?>): String? {
        val library = (variant["gfn"] as? Map<String, Any?>)?.get("library") as? Map<String, Any?>
        return library?.get("status") as? String
    }

    private fun variantId(variant: Map<String, Any?>): String? = variant["id"] as? String
    private fun variantStore(variant: Map<String, Any?>): String? = variant["appStore"] as? String
    private fun variantStoreUrl(variant: Map<String, Any?>): String? = variant["storeUrl"] as? String

    private fun gfnGame(
        id: String,
        title: String,
        store: String,
        imageUrl: String?,
        owned: Boolean?,
        appId: String?,
        subscription: String? = null,
        steamAppId: String? = null,
    ): Map<String, Any?> {
        val map = LinkedHashMap<String, Any?>()
        map["id"] = id
        map["title"] = title
        map["store"] = store
        map["genres"] = emptyList<String>()
        if (imageUrl != null) map["imageUrl"] = imageUrl
        // Omit the key entirely for "undefined" (tri-state owned), rather
        // than putting null -- matches how `owned: x || undefined` never
        // survives as a real key once the JS side's MMKV write round-trips
        // it through JSON.stringify anyway.
        if (owned != null) map["owned"] = owned
        if (appId != null) map["appId"] = appId
        if (subscription != null) map["subscription"] = subscription
        if (steamAppId != null) map["steamAppId"] = steamAppId
        return map
    }

    // Port of toOwnedGames: one GfnGame per distinct numeric store variant
    // that's actually owned (library.status in the allowlist), falling back
    // progressively (owned-only -> numeric -> every variant) exactly like
    // the TS version, so an app with no recognizable owned variant still
    // emits something rather than silently vanishing from the library.
    @Suppress("UNCHECKED_CAST")
    private fun toOwnedGames(app: Map<String, Any?>): List<Map<String, Any?>> {
        val title = (app["title"] as? String)?.trim()
        if (title.isNullOrEmpty()) return emptyList()
        val appId = app["id"] as? String
        val variants = (app["variants"] as? List<Map<String, Any?>>) ?: emptyList()
        val numericVariants = variants.filter { isNumeric(variantId(it)) }
        val launchable = if (numericVariants.isNotEmpty()) numericVariants else variants
        val ownedVariants = launchable.filter { isOwnedLibraryStatus(variantStatus(it) ?: "") }
        val usable = if (ownedVariants.isNotEmpty()) ownedVariants else launchable
        val image = firstImage(app["images"] as? Map<String, Any?>)
        val resolvedAppId = if (!appId.isNullOrEmpty() && !isNumeric(appId)) appId else null

        if (usable.isEmpty()) {
            val id = if (isNumeric(appId)) appId!! else (appId ?: title)
            return listOf(gfnGame(id, title, "GFN", image, true, resolvedAppId))
        }

        val seen = HashSet<String>()
        val result = mutableListOf<Map<String, Any?>>()
        for (variant in usable) {
            val id = variantId(variant) ?: (appId ?: title)
            val store = variantStore(variant) ?: "GFN"
            val key = "$store:$id"
            if (!seen.add(key)) continue
            val steamAppId = if (store.uppercase() == "STEAM") steamAppIdFromUrl(variantStoreUrl(variant)) else null
            result.add(
                gfnGame(id, title, store, image, true, resolvedAppId, variantSubscription(variant), steamAppId),
            )
        }
        return result
    }

    // Port of toBrowseGames: same variant-flattening, but ownership is read
    // per variant (most browse-catalog entries aren't owned) unless
    // isConfirmedPlayable already says the whole app is free-to-play.
    @Suppress("UNCHECKED_CAST")
    private fun toBrowseGames(app: Map<String, Any?>): List<Map<String, Any?>> {
        val title = (app["title"] as? String)?.trim()
        if (title.isNullOrEmpty()) return emptyList()
        val appId = app["id"] as? String
        val variants = (app["variants"] as? List<Map<String, Any?>>) ?: emptyList()
        val numericVariants = variants.filter { isNumeric(variantId(it)) }
        val usable = if (numericVariants.isNotEmpty()) numericVariants else variants
        val image = firstImage(app["images"] as? Map<String, Any?>)
        val resolvedAppId = if (!appId.isNullOrEmpty() && !isNumeric(appId)) appId else null
        val confirmedPlayable = isConfirmedPlayable(app["gfn"] as? Map<String, Any?>)

        if (usable.isEmpty()) {
            val id = if (isNumeric(appId)) appId!! else (appId ?: title)
            val owned = if (confirmedPlayable) true else null
            return listOf(gfnGame(id, title, "GFN", image, owned, resolvedAppId))
        }

        val seen = HashSet<String>()
        val result = mutableListOf<Map<String, Any?>>()
        for (variant in usable) {
            val id = variantId(variant) ?: (appId ?: title)
            val store = variantStore(variant) ?: "GFN"
            val key = "$store:$id"
            if (!seen.add(key)) continue
            val status = variantStatus(variant)
            val owned = if (confirmedPlayable) {
                true
            } else if (status != null) {
                isOwnedLibraryStatus(status)
            } else {
                null
            }
            val steamAppId = if (store.uppercase() == "STEAM") steamAppIdFromUrl(variantStoreUrl(variant)) else null
            result.add(
                gfnGame(id, title, store, image, owned, resolvedAppId, variantSubscription(variant), steamAppId),
            )
        }
        return result
    }

    // --- owned library ------------------------------------------------

    private const val LIBRARY_PAGE_SIZE = 200
    private const val LIBRARY_MAX_PAGES = 20
    private const val LIBRARY_SORT =
        "variants.gfn.library.lastPlayedDate:DESC,computedValues.libraryAddedDate:DESC,sortName:ASC"
    private val LIBRARY_FILTER = mapOf(
        "variants" to mapOf("gfn" to mapOf("library" to mapOf("status" to mapOf("notEquals" to "NOT_OWNED")))),
    )
    private const val LIBRARY_QUERY = """query GetLibraryApps(
  ${'$'}vpcId: String!,
  ${'$'}locale: String!,
  ${'$'}sortString: String!,
  ${'$'}fetchCount: Int!,
  ${'$'}cursor: String!,
  ${'$'}filters: AppFilterFields!
) {
  apps(
    vpcId: ${'$'}vpcId,
    language: ${'$'}locale,
    orderBy: ${'$'}sortString,
    first: ${'$'}fetchCount,
    after: ${'$'}cursor,
    filters: ${'$'}filters
  ) {
    pageInfo { hasNextPage endCursor }
    items {
      id
      title
      images { HERO_IMAGE TV_BANNER KEY_ART GAME_BOX_ART }
      variants {
        id
        appStore
        storeUrl
        gfn { library { status subscription } }
      }
    }
  }
}"""

    data class LibraryPage(val items: List<Map<String, Any?>>, val hasNextPage: Boolean, val endCursor: String)

    @Suppress("UNCHECKED_CAST")
    private fun fetchLibraryPage(token: String, vpcId: String, locale: String, cursor: String): LibraryPage? {
        return try {
            val variables = mapOf(
                "vpcId" to vpcId,
                "locale" to locale,
                "sortString" to LIBRARY_SORT,
                "fetchCount" to LIBRARY_PAGE_SIZE,
                "cursor" to cursor,
                "filters" to LIBRARY_FILTER,
            )
            val request = graphqlRequest(token, LIBRARY_QUERY, variables)
            httpClient(GRAPHQL_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val parsed = parseJsonObject(body) ?: return null
                val data = parsed["data"] as? Map<String, Any?>
                val apps = data?.get("apps") as? Map<String, Any?>
                val items = (apps?.get("items") as? List<Map<String, Any?>>) ?: emptyList()
                val pageInfo = apps?.get("pageInfo") as? Map<String, Any?>
                LibraryPage(
                    items = items,
                    hasNextPage = pageInfo?.get("hasNextPage") == true,
                    endCursor = pageInfo?.get("endCursor") as? String ?: "",
                )
            }
        } catch (e: Exception) {
            null
        }
    }

    data class OwnedGamesResult(val games: List<Map<String, Any?>>, val complete: Boolean)

    // Mirrors fetchGfnOwnedGames exactly, including its "complete" signal:
    // the JS wrapper only persists the MMKV cache when complete is true,
    // same as the original only caching after a clean, fully-paged walk.
    suspend fun getOwnedGames(token: String, locale: String): OwnedGamesResult {
        val vpcId = getVpcId(token) ?: return OwnedGamesResult(emptyList(), false)
        val items = mutableListOf<Map<String, Any?>>()
        var cursor = ""
        var complete = true
        for (page in 0 until LIBRARY_MAX_PAGES) {
            val result = fetchLibraryPage(token, vpcId, locale, cursor)
            if (result == null) {
                if (page == 0) return OwnedGamesResult(emptyList(), false)
                complete = false
                break
            }
            items.addAll(result.items)
            if (!result.hasNextPage || result.endCursor.isEmpty() || result.endCursor == cursor) {
                break
            }
            cursor = result.endCursor
        }
        val games = items.flatMap { toOwnedGames(it) }
        return OwnedGamesResult(games, complete)
    }

    // --- full browse catalog -----------------------------------------

    private const val BROWSE_PAGE_SIZE = 200
    private const val BROWSE_MAX_PAGES = 40
    private const val BROWSE_PAGE_RETRIES = 2
    private const val BROWSE_PAGE_RETRY_DELAY_MS = 1000L
    private const val BROWSE_QUERY = """query GetStoreBrowseApps(
  ${'$'}vpcId: String!,
  ${'$'}locale: String!,
  ${'$'}sortString: String!,
  ${'$'}fetchCount: Int!,
  ${'$'}cursor: String!,
  ${'$'}filters: AppFilterFields!
) {
  apps(
    vpcId: ${'$'}vpcId,
    language: ${'$'}locale,
    orderBy: ${'$'}sortString,
    first: ${'$'}fetchCount,
    after: ${'$'}cursor,
    filters: ${'$'}filters
  ) {
    pageInfo { hasNextPage endCursor totalCount }
    items {
      id
      title
      images { HERO_IMAGE TV_BANNER KEY_ART GAME_BOX_ART }
      gfn { playType playabilityState }
      variants {
        id
        appStore
        storeUrl
        gfn { library { status subscription } }
      }
    }
  }
}"""

    // Throws (never returns null) on failure, after BROWSE_PAGE_RETRIES
    // extra attempts -- the caller treats that as "give up on the crawl",
    // same as the TS version's fetchBrowsePage.
    private suspend fun fetchBrowsePage(token: String, vpcId: String, locale: String, cursor: String): Map<String, Any?> {
        var lastError: Exception? = null
        for (attempt in 0..BROWSE_PAGE_RETRIES) {
            try {
                val variables = mapOf(
                    "vpcId" to vpcId,
                    "locale" to locale,
                    "sortString" to "sortName:ASC",
                    "fetchCount" to BROWSE_PAGE_SIZE,
                    "cursor" to cursor,
                    "filters" to emptyMap<String, Any?>(),
                )
                val request = graphqlRequest(token, BROWSE_QUERY, variables)
                httpClient(GRAPHQL_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw java.io.IOException("GFN browse page failed (${response.code})")
                    }
                    val body = response.body?.string() ?: throw java.io.IOException("empty body")
                    return parseJsonObject(body) ?: throw java.io.IOException("malformed body")
                }
            } catch (e: Exception) {
                lastError = e
                if (attempt < BROWSE_PAGE_RETRIES) {
                    delay(BROWSE_PAGE_RETRY_DELAY_MS * (attempt + 1))
                }
            }
        }
        throw lastError ?: IllegalStateException("fetchBrowsePage failed")
    }

    data class FullCatalogResult(val games: List<Map<String, Any?>>, val complete: Boolean, val totalCount: Int?)

    @Suppress("UNCHECKED_CAST")
    suspend fun getFullCatalog(token: String, locale: String): FullCatalogResult {
        val vpcId = getVpcId(token) ?: return FullCatalogResult(emptyList(), false, null)
        val games = mutableListOf<Map<String, Any?>>()
        var cursor = ""
        var complete = false
        var totalCount: Int? = null
        for (page in 0 until BROWSE_MAX_PAGES) {
            val payload = try {
                fetchBrowsePage(token, vpcId, locale, cursor)
            } catch (e: Exception) {
                break // Gave up even after retries -- not complete.
            }
            val apps = payload["data"]?.let { (it as? Map<String, Any?>)?.get("apps") as? Map<String, Any?> }
            val items = (apps?.get("items") as? List<Map<String, Any?>>) ?: emptyList()
            val pageInfo = apps?.get("pageInfo") as? Map<String, Any?>
            (pageInfo?.get("totalCount") as? Number)?.let { totalCount = it.toInt() }
            if (items.isEmpty()) {
                complete = true
                break
            }
            games.addAll(items.flatMap { toBrowseGames(it) })
            if (pageInfo?.get("hasNextPage") != true) {
                complete = true
                break
            }
            val next = pageInfo["endCursor"] as? String
            if (next.isNullOrEmpty() || next == cursor) {
                break // Cursor didn't advance -- a server anomaly, not exhaustion.
            }
            cursor = next
        }
        return FullCatalogResult(games, complete, totalCount)
    }

    // --- catalog rank ---------------------------------------------------

    private const val CATALOG_RANK_QUERY = """query GetCatalogRank(
  ${'$'}vpcId: String!,
  ${'$'}locale: String!,
  ${'$'}sortString: String!,
  ${'$'}fetchCount: Int!,
  ${'$'}cursor: String!,
  ${'$'}filters: AppFilterFields!
) {
  apps(
    vpcId: ${'$'}vpcId,
    language: ${'$'}locale,
    orderBy: ${'$'}sortString,
    first: ${'$'}fetchCount,
    after: ${'$'}cursor,
    filters: ${'$'}filters
  ) {
    pageInfo { hasNextPage endCursor }
    items { id variants { id } }
  }
}"""

    @Suppress("UNCHECKED_CAST")
    suspend fun getCatalogOrder(token: String, locale: String, orderBy: String): List<String> {
        val vpcId = getVpcId(token) ?: return emptyList()
        val order = mutableListOf<String>()
        val seen = HashSet<String>()
        var cursor = ""
        for (page in 0 until BROWSE_MAX_PAGES) {
            val variables = mapOf(
                "vpcId" to vpcId,
                "locale" to locale,
                "sortString" to orderBy,
                "fetchCount" to BROWSE_PAGE_SIZE,
                "cursor" to cursor,
                "filters" to emptyMap<String, Any?>(),
            )
            val payload = try {
                val request = graphqlRequest(token, CATALOG_RANK_QUERY, variables)
                httpClient(GRAPHQL_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use null
                    val body = response.body?.string() ?: return@use null
                    parseJsonObject(body)
                }
            } catch (e: Exception) {
                null
            } ?: break
            val apps = payload["data"]?.let { (it as? Map<String, Any?>)?.get("apps") as? Map<String, Any?> }
            val items = (apps?.get("items") as? List<Map<String, Any?>>) ?: emptyList()
            if (items.isEmpty()) break
            for (app in items) {
                val variants = (app["variants"] as? List<Map<String, Any?>>)?.filter { isNumeric(variantId(it)) }
                    ?: emptyList()
                val ids = if (variants.isNotEmpty()) {
                    variants.mapNotNull { variantId(it) }
                } else {
                    val appId = app["id"] as? String
                    if (isNumeric(appId)) listOf(appId!!) else emptyList()
                }
                for (id in ids) {
                    if (seen.add(id)) order.add(id)
                }
            }
            val pageInfo = apps?.get("pageInfo") as? Map<String, Any?>
            val next = pageInfo?.get("endCursor") as? String
            if (pageInfo?.get("hasNextPage") != true || next.isNullOrEmpty() || next == cursor) {
                break
            }
            cursor = next
        }
        return order
    }

    // --- app details ------------------------------------------------------

    private const val APP_DETAILS_QUERY = """query GetAppDataQueryForAppId(
  ${'$'}vpcId: String!,
  ${'$'}locale: String!,
  ${'$'}appIds: [String]!
) {
  apps(vpcId: ${'$'}vpcId, language: ${'$'}locale, appIds: ${'$'}appIds) {
    items {
      developerName
      publisherName
      shortDescription
      longDescription
      genres
      images { SCREENSHOTS }
    }
  }
}"""

    @Suppress("UNCHECKED_CAST")
    suspend fun getAppDetails(token: String, locale: String, appId: String): Map<String, Any?>? {
        val vpcId = getVpcId(token) ?: return null
        return try {
            val variables = mapOf("vpcId" to vpcId, "locale" to locale, "appIds" to listOf(appId))
            val request = graphqlRequest(token, APP_DETAILS_QUERY, variables)
            httpClient(GRAPHQL_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val payload = parseJsonObject(body) ?: return null
                val apps = payload["data"]?.let { (it as? Map<String, Any?>)?.get("apps") as? Map<String, Any?> }
                val item = (apps?.get("items") as? List<Map<String, Any?>>)?.firstOrNull() ?: return null
                val screenshots = (item["images"] as? Map<String, Any?>)?.get("SCREENSHOTS") as? List<*>
                val result = LinkedHashMap<String, Any?>()
                (item["developerName"] as? String)?.takeIf { it.isNotEmpty() }?.let { result["developerName"] = it }
                (item["publisherName"] as? String)?.takeIf { it.isNotEmpty() }?.let { result["publisherName"] = it }
                (item["shortDescription"] as? String)?.takeIf { it.isNotEmpty() }
                    ?.let { result["shortDescription"] = it }
                (item["longDescription"] as? String)?.takeIf { it.isNotEmpty() }
                    ?.let { result["longDescription"] = it }
                (item["genres"] as? List<*>)?.let { result["genres"] = it }
                result["screenshots"] = screenshots?.filterIsInstance<String>()?.filter { it.isNotEmpty() }
                    ?: emptyList<String>()
                result
            }
        } catch (e: Exception) {
            null
        }
    }

    // --- linked stores ------------------------------------------------------

    private const val LINKED_STORES_QUERY = """query GetUserAccountLinkingData{
  userAccount {
    storesData {
      store
      accountLinkingData {
        accountSyncingData {
          totalNumberOfSyncedGfnGames
        }
      }
    }
  }
}"""

    @Suppress("UNCHECKED_CAST")
    suspend fun getLinkedStores(token: String): List<Map<String, Any?>> {
        return try {
            val request = graphqlRequestNoVars(token, LINKED_STORES_QUERY)
            httpClient(GRAPHQL_TIMEOUT_SECONDS).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val payload = parseJsonObject(body) ?: return emptyList()
                val userAccount = payload["data"]?.let { (it as? Map<String, Any?>)?.get("userAccount") as? Map<String, Any?> }
                val storesData = userAccount?.get("storesData") as? List<Map<String, Any?>> ?: return emptyList()
                storesData
                    .filter { it["store"] != null && it["accountLinkingData"] != null }
                    .map { entry ->
                        val linking = entry["accountLinkingData"] as? Map<String, Any?>
                        val syncing = linking?.get("accountSyncingData") as? Map<String, Any?>
                        val count = syncing?.get("totalNumberOfSyncedGfnGames") as? Number
                        val result = LinkedHashMap<String, Any?>()
                        result["store"] = entry["store"] as String
                        if (count != null) result["syncedGameCount"] = count.toInt()
                        result
                    }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
