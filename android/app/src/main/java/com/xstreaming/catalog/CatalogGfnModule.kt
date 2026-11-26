package com.xstreaming.catalog

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * RN bridge for [GfnCatalogClient]. Every method here resolves, never
 * rejects -- same "never throws to the caller" contract the TS version had
 * (empty array/null on any failure), matching every other catalog-title
 * module except CatalogDisplayModule.
 */
class CatalogGfnModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogGfnModule"

    @ReactMethod
    fun getOwnedGames(token: String, locale: String, promise: Promise) {
        scope.launch {
            try {
                val result = GfnCatalogClient.getOwnedGames(token, locale)
                promise.resolve(ownedGamesResultMap(result))
            } catch (e: Exception) {
                promise.resolve(ownedGamesResultMap(GfnCatalogClient.OwnedGamesResult(emptyList(), false)))
            }
        }
    }

    @ReactMethod
    fun getFullCatalog(token: String, locale: String, promise: Promise) {
        scope.launch {
            try {
                val result = GfnCatalogClient.getFullCatalog(token, locale)
                promise.resolve(fullCatalogResultMap(result))
            } catch (e: Exception) {
                promise.resolve(fullCatalogResultMap(GfnCatalogClient.FullCatalogResult(emptyList(), false, null)))
            }
        }
    }

    @ReactMethod
    fun getCatalogOrder(token: String, locale: String, orderBy: String, promise: Promise) {
        scope.launch {
            try {
                val order = GfnCatalogClient.getCatalogOrder(token, locale, orderBy)
                val arr = Arguments.createArray()
                order.forEach { arr.pushString(it) }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getAppDetails(token: String, locale: String, appId: String, promise: Promise) {
        scope.launch {
            try {
                val details = GfnCatalogClient.getAppDetails(token, locale, appId)
                if (details == null) {
                    promise.resolve(null)
                } else {
                    promise.resolve(Arguments.makeNativeMap(details))
                }
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun getLinkedStores(token: String, promise: Promise) {
        scope.launch {
            try {
                promise.resolve(mapListToWritableArray(GfnCatalogClient.getLinkedStores(token)))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    private fun ownedGamesResultMap(result: GfnCatalogClient.OwnedGamesResult) =
        Arguments.createMap().apply {
            putArray("games", mapListToWritableArray(result.games))
            putBoolean("complete", result.complete)
        }

    private fun fullCatalogResultMap(result: GfnCatalogClient.FullCatalogResult) =
        Arguments.createMap().apply {
            putArray("games", mapListToWritableArray(result.games))
            putBoolean("complete", result.complete)
            if (result.totalCount != null) putInt("totalCount", result.totalCount) else putNull("totalCount")
        }

    private fun mapListToWritableArray(value: List<Map<String, Any?>>) =
        Arguments.createArray().apply {
            for (item in value) pushMap(Arguments.makeNativeMap(item))
        }
}
