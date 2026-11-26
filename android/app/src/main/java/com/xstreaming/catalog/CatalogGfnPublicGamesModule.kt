package com.xstreaming.catalog

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * RN bridge for [GfnPublicGamesClient] -- see that object's doc comment.
 * entities/catalog-title/api/gfnPublicGames.ts's fetchGfnGames() calls this
 * for the fetch+map step, then writes the result to its own MMKV cache
 * exactly as before.
 */
class CatalogGfnPublicGamesModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogGfnPublicGamesModule"

    @ReactMethod
    fun fetchGames(slug: String, promise: Promise) {
        scope.launch {
            try {
                val games = GfnPublicGamesClient.fetchGames(slug)
                val result: WritableArray = Arguments.createArray()
                for (game in games) {
                    val map = Arguments.createMap()
                    map.putString("id", game.id)
                    map.putString("title", game.title)
                    map.putString("store", game.store)
                    if (game.publisher != null) map.putString("publisher", game.publisher)
                    val genres = Arguments.createArray()
                    game.genres.forEach { genres.pushString(it) }
                    map.putArray("genres", genres)
                    if (game.steamAppId != null) map.putString("steamAppId", game.steamAppId)
                    if (game.imageUrl != null) map.putString("imageUrl", game.imageUrl)
                    if (game.heroUrl != null) map.putString("heroUrl", game.heroUrl)
                    result.pushMap(map)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("fetch_failed", e.message, e)
            }
        }
    }
}
