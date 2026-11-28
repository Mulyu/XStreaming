package com.xstreaming.settings

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.xstreaming.catalog.GfnCatalogClient
import kotlinx.coroutines.CancellationException

/**
 * Kotlin port of entities/catalog-title/api/gfnCatalog.ts's caching layer
 * around [GfnCatalogClient]'s own getOwnedGames()/getFullCatalog()/
 * getLinkedStores() -- those already exist (built for the old RN bridge,
 * CatalogGfnModule.kt), are plain Kotlin returning plain Kotlin data, and
 * are callable directly with no bridge involved. This file mirrors
 * gfnCatalog.ts's own MMKV cache-key naming/TTL/status-tracking exactly,
 * writing to the SAME locale-suffixed MMKV keys the (still-JS) Library
 * screen still reads -- without this, the native Settings screen's resync
 * button would tell NVIDIA to resync but never actually refresh what the
 * Library screen shows until that screen's own cache naturally expires.
 */
object GfnCatalogCache {
    private val gson = Gson()

    // v3, matching gfnCatalog.ts's own FULL_CATALOG_CACHE_VERSION/
    // ownedCacheKey's "v3" -- must stay in lockstep with that file: this is
    // the SAME cache, read by the SAME (unported) JS Library screen code.
    private fun ownedCacheKey(localeSlug: String) = "gfn.ownedGames.v3.$localeSlug"
    private fun fullCatalogCacheKey(localeSlug: String) = "gfn.fullCatalog.v3.$localeSlug"
    private fun fullCatalogStatusKey(localeSlug: String) = "gfn.fullCatalog.status.v3.$localeSlug"

    // Mirrors fetchGfnLinkedStores(): thin wrapper, no caching.
    suspend fun fetchGfnLinkedStores(token: String): List<Map<String, Any?>> {
        return try {
            GfnCatalogClient.getLinkedStores(token)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
    }

    // Mirrors fetchGfnOwnedGames(): caches only on a complete result
    // (native reports partial results via `complete: false`), same as the
    // TS version -- a failed later page must not overwrite a good cache
    // with a partial one.
    suspend fun fetchGfnOwnedGames(context: Context, token: String, localeSlug: String, graphqlLocale: String) {
        ensureMmkvInitialized(context)
        val result = try {
            GfnCatalogClient.getOwnedGames(token, graphqlLocale)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            GfnCatalogClient.OwnedGamesResult(emptyList(), false)
        }
        if (result.complete) {
            val payload = JsonObject()
            payload.addProperty("ts", System.currentTimeMillis())
            payload.add("games", gson.toJsonTree(result.games))
            NativeSettingsStore.nativeSetMmkvString(ownedCacheKey(localeSlug), gson.toJson(payload))
        }
    }

    // Mirrors fetchGfnFullCatalog(): always records the status (so the
    // Settings screen -- or, here, the next JS read of it -- can show
    // "loaded/partial/failed" without triggering a fetch itself); caches
    // the games list whenever it's non-empty, even a partial crawl, same
    // as the TS version's own comment on why (a partial browse catalog is
    // still far better than none).
    suspend fun fetchGfnFullCatalog(context: Context, token: String, localeSlug: String, graphqlLocale: String) {
        ensureMmkvInitialized(context)
        val result = try {
            GfnCatalogClient.getFullCatalog(token, graphqlLocale)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            GfnCatalogClient.FullCatalogResult(emptyList(), false, null)
        }
        val status = JsonObject()
        status.addProperty("ts", System.currentTimeMillis())
        status.addProperty("complete", result.complete)
        status.addProperty("count", result.games.size)
        // Omits "totalCount" entirely when null, matching
        // JSON.stringify({..., totalCount: undefined}) -- that drops the
        // key rather than writing a JSON null, and getGfnFullCatalogStatus
        // (unported, still JS) never checks for an explicit null there.
        if (result.totalCount != null) {
            status.addProperty("totalCount", result.totalCount)
        }
        NativeSettingsStore.nativeSetMmkvString(fullCatalogStatusKey(localeSlug), gson.toJson(status))
        if (result.games.isNotEmpty()) {
            val payload = JsonObject()
            payload.addProperty("ts", System.currentTimeMillis())
            payload.add("games", gson.toJsonTree(result.games))
            NativeSettingsStore.nativeSetMmkvString(fullCatalogCacheKey(localeSlug), gson.toJson(payload))
        }
    }
}
