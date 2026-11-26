package com.xstreaming.catalog

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * RN bridge for [XcloudCatalogClient] -- see that object's doc comment.
 * entities/catalog-title/api/xcloudCatalogApi.ts's XcloudCatalogApi class
 * now calls this instead of axios, keeping its own class name/constructor/
 * method signatures so every caller (loadXcloudCatalog.ts,
 * useLibraryScreen.ts, pages/chart) needs zero changes.
 *
 * Every method here resolves, never rejects -- same "never throws to the
 * caller" contract the TS version had (empty array/object/map on any
 * failure), so JS-side callers keep using Array.isArray()/truthiness
 * checks exactly as before instead of try/catch.
 */
class CatalogXcloudModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogXcloudModule"

    @ReactMethod
    fun getOfficialTitles(promise: Promise) {
        scope.launch {
            try {
                promise.resolve(Arguments.makeNativeArray(XcloudCatalogClient.getOfficialTitles()))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getCatalogGames(prods: ReadableArray, v2TitleMap: ReadableMap, lang: String, promise: Promise) {
        scope.launch {
            try {
                val prodsList = readableArrayToAny(prods)
                val titleMap = readableMapToAny(v2TitleMap)
                val games = XcloudCatalogClient.getCatalogGames(prodsList, titleMap, lang)
                promise.resolve(mapListToWritableArray(games))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getGamePassProducts(titles: ReadableArray, lang: String, promise: Promise) {
        scope.launch {
            try {
                val titlesList = readableArrayToAny(titles)
                val products = XcloudCatalogClient.getGamePassProducts(titlesList, lang)
                promise.resolve(mapListToWritableArray(products))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    // Resolves the raw parsed response ({results: [...]}-shaped object) on
    // success, or a bare [] on failure -- loadXcloudCatalog.ts tells the two
    // apart via Array.isArray(res), so this shape asymmetry must survive
    // the bridge unchanged, not get normalized into one consistent type.
    @ReactMethod
    fun getTitles(host: String, gsToken: String, promise: Promise) {
        scope.launch {
            try {
                resolveAny(promise, XcloudCatalogClient.getTitles(host, gsToken))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getNewTitles(promise: Promise) {
        scope.launch {
            try {
                resolveAny(promise, XcloudCatalogClient.getNewTitles())
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getReleaseDates(productIds: ReadableArray, promise: Promise) {
        scope.launch {
            try {
                val ids = (0 until productIds.size()).mapNotNull { productIds.getString(it) }
                val dates = XcloudCatalogClient.getReleaseDates(ids)
                val result = Arguments.createMap()
                for ((id, date) in dates) result.putString(id, date)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.resolve(Arguments.createMap())
            }
        }
    }

    @ReactMethod
    fun getRecentTitles(host: String, gsToken: String, promise: Promise) {
        scope.launch {
            try {
                resolveAny(promise, XcloudCatalogClient.getRecentTitles(host, gsToken))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getAlternateIds(host: String, gsToken: String, id: String, promise: Promise) {
        scope.launch {
            try {
                resolveAny(promise, XcloudCatalogClient.getAlternateIds(host, gsToken, id))
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    @ReactMethod
    fun getConsoles(host: String, gsToken: String, promise: Promise) {
        scope.launch {
            try {
                promise.resolve(
                    Arguments.makeNativeArray(XcloudCatalogClient.getConsoles(host, gsToken)),
                )
            } catch (e: Exception) {
                promise.resolve(Arguments.createArray())
            }
        }
    }

    // getTitles/getNewTitles/getRecentTitles/getAlternateIds resolve
    // whatever Gson's untyped parse produced -- a Map, a List, or (rarely)
    // a bare primitive -- straight through, preserving the raw-object-vs-
    // empty-array shape distinction those methods rely on.
    private fun resolveAny(promise: Promise, value: Any) {
        when (value) {
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                promise.resolve(Arguments.makeNativeMap(value as Map<String, Any?>))
            }
            is List<*> -> promise.resolve(Arguments.makeNativeArray(value))
            else -> promise.resolve(Arguments.createArray())
        }
    }

    private fun mapListToWritableArray(value: List<Map<String, Any?>>) =
        Arguments.createArray().apply {
            for (item in value) pushMap(Arguments.makeNativeMap(item))
        }

    // Explicit recursive ReadableMap/ReadableArray -> plain Kotlin Map/List
    // conversion, using only the public ReadableMap/ReadableArray interface
    // (ReadableType + getMap/getArray/getString/getDouble/getBoolean)
    // rather than casting to the concrete ReadableNativeMap/
    // ReadableNativeArray implementation, so it holds under both the old
    // and new (bridgeless) architectures.
    private fun readableMapToAny(map: ReadableMap): Map<String, Any?> {
        val result = LinkedHashMap<String, Any?>()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            result[key] = when (map.getType(key)) {
                ReadableType.Null -> null
                ReadableType.Boolean -> map.getBoolean(key)
                ReadableType.Number -> map.getDouble(key)
                ReadableType.String -> map.getString(key)
                ReadableType.Map -> map.getMap(key)?.let { readableMapToAny(it) }
                ReadableType.Array -> map.getArray(key)?.let { readableArrayToAny(it) }
                else -> null
            }
        }
        return result
    }

    private fun readableArrayToAny(array: ReadableArray): List<Any?> {
        val result = ArrayList<Any?>(array.size())
        for (i in 0 until array.size()) {
            result.add(
                when (array.getType(i)) {
                    ReadableType.Null -> null
                    ReadableType.Boolean -> array.getBoolean(i)
                    ReadableType.Number -> array.getDouble(i)
                    ReadableType.String -> array.getString(i)
                    ReadableType.Map -> readableMapToAny(array.getMap(i))
                    ReadableType.Array -> readableArrayToAny(array.getArray(i))
                    else -> null
                },
            )
        }
        return result
    }
}
