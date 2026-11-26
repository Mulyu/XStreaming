package com.xstreaming.catalog

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * RN bridge for [SteamPriceClient] -- see that object's doc comment.
 * entities/catalog-title/api/steamPrice.ts's fetchSteamPrices() now calls
 * this instead of axios directly; the cache (model/steamPriceCache.ts) and
 * every other export in that file are untouched.
 */
class CatalogSteamPriceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogSteamPriceModule"

    @ReactMethod
    fun fetchPrices(appIds: ReadableArray, cc: String, language: String, promise: Promise) {
        val ids = (0 until appIds.size()).mapNotNull { appIds.getString(it) }
        scope.launch {
            try {
                val prices = SteamPriceClient.fetchPrices(ids, cc, language)
                val result = Arguments.createMap()
                for ((id, info) in prices) {
                    val entry = Arguments.createMap()
                    entry.putString("currencyCode", info.currencyCode)
                    entry.putDouble("initial", info.initial.toDouble())
                    entry.putDouble("final", info.final.toDouble())
                    entry.putInt("discountPercent", info.discountPercent)
                    result.putMap(id, entry)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                // fetchSteamPrices never rejects on the TS side either --
                // resolve an empty map rather than surface an error to JS.
                promise.resolve(Arguments.createMap())
            }
        }
    }
}
