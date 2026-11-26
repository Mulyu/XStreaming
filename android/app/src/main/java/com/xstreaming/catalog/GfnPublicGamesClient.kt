package com.xstreaming.catalog

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import okhttp3.Request

data class GfnPublicGame(
    val id: String,
    val title: String,
    val store: String,
    val publisher: String?,
    val genres: List<String>,
    val steamAppId: String?,
    val imageUrl: String?,
    val heroUrl: String?,
)

/**
 * Kotlin port of entities/catalog-title/api/gfnPublicGames.ts's
 * fetchGfnGames -- GeForce NOW's public (no-auth) per-locale supported-games
 * JSON. Caching (the file's own storage.set/getFreshGfnGames/
 * getCachedGfnGames) stays in JS; this is fetch + parse + the same
 * row-mapping logic only. The locale slug is resolved in JS
 * (getGfnLocaleSlug() reads the app's own language setting) and passed in.
 */
object GfnPublicGamesClient {
    private fun publicGamesUrl(slug: String): String =
        "https://static.nvidiagrid.net/supported-public-game-list/locales/gfnpc-$slug.json"

    // Mirrors steamAppIdFromUrl in gfnPublicGames.ts exactly (a leading
    // digit run right after "/app/", not a whole-remainder match -- see
    // that function's own comment on why the whole-remainder version
    // silently dropped steamAppId for query-string-suffixed URLs).
    private fun steamAppIdFromUrl(steamUrl: String?): String? {
        if (steamUrl.isNullOrEmpty()) {
            return null
        }
        val after = steamUrl.split("/app/").getOrNull(1) ?: return null
        val match = Regex("^(\\d+)").find(after) ?: return null
        return match.groupValues[1]
    }

    private fun toGfnGame(item: JsonObject): GfnPublicGame {
        val steamUrl = item.get("steamUrl")?.takeIf { it.isJsonPrimitive }?.asString
        val steamAppId = steamAppIdFromUrl(steamUrl)
        val id = item.get("id")?.takeIf { it.isJsonPrimitive }?.asString
            ?: item.get("title")?.takeIf { it.isJsonPrimitive }?.asString
            ?: "unknown"
        val genres = (item.get("genres") as? JsonArray)
            ?.mapNotNull { it.takeIf { g -> g.isJsonPrimitive }?.asString }
            ?: emptyList()
        return GfnPublicGame(
            id = id,
            title = item.get("title")?.takeIf { it.isJsonPrimitive }?.asString ?: "",
            store = item.get("store")?.takeIf { it.isJsonPrimitive }?.asString ?: "Unknown",
            publisher = item.get("publisher")?.takeIf { it.isJsonPrimitive }?.asString,
            genres = genres,
            steamAppId = steamAppId,
            imageUrl = steamAppId?.let {
                "https://cdn.cloudflare.steamstatic.com/steam/apps/$it/header.jpg"
            },
            heroUrl = steamAppId?.let {
                "https://cdn.cloudflare.steamstatic.com/steam/apps/$it/library_hero.jpg"
            },
        )
    }

    // Fetches, filters to AVAILABLE+titled rows, and maps -- same as
    // mapPayload() in the TS version. Not re-sorted here either, for the
    // same reason the TS version isn't: every caller sorts its own final
    // output downstream.
    suspend fun fetchGames(slug: String): List<GfnPublicGame> {
        val request = Request.Builder().url(publicGamesUrl(slug)).build()
        CatalogHttpClient.instance.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw java.io.IOException("GFN public games fetch failed (${response.code})")
            }
            val body = response.body?.string() ?: "[]"
            val payload = JsonParser.parseString(body).takeIf { it.isJsonArray }?.asJsonArray
                ?: JsonArray()
            return payload
                .mapNotNull { it.takeIf { row -> row.isJsonObject }?.asJsonObject }
                .filter { row ->
                    val status = row.get("status")?.takeIf { it.isJsonPrimitive }?.asString
                    val title = row.get("title")?.takeIf { it.isJsonPrimitive }?.asString
                    status == "AVAILABLE" && !title.isNullOrEmpty()
                }
                .map { toGfnGame(it) }
        }
    }
}
