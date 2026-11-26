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
 * RN bridge for [DisplayCatalogClient]. Unlike the other catalog-title
 * bridge modules, this one rejects on failure instead of resolving an empty
 * fallback: storePrice.ts's retry-with-backoff and "ok" success flag rely on
 * a failed fetch throwing, exactly like the axios call it replaces.
 */
class CatalogDisplayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogDisplayModule"

    @ReactMethod
    fun fetchProducts(bigIds: String, market: String, language: String, promise: Promise) {
        scope.launch {
            try {
                val products = DisplayCatalogClient.fetchProducts(bigIds, market, language)
                promise.resolve(Arguments.makeNativeArray(products))
            } catch (e: Exception) {
                promise.reject("display_catalog_fetch_failed", e)
            }
        }
    }
}
