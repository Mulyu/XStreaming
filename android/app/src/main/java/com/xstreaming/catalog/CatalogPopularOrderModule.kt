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
 * RN bridge for [PopularOrderClient] -- see that object's doc comment.
 * entities/catalog-title/api/popularOrder.ts's fetchPopularOrder() calls
 * this; buildPopularRank() and the cache in model/priceCache.ts are
 * untouched.
 */
class CatalogPopularOrderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "CatalogPopularOrderModule"

    @ReactMethod
    fun fetchOrder(
        market: String,
        language: String,
        attempts: Double,
        baseDelayMs: Double,
        promise: Promise,
    ) {
        scope.launch {
            try {
                val order = PopularOrderClient.fetchOrder(
                    market = market,
                    language = language,
                    attempts = attempts.toInt(),
                    baseDelayMs = baseDelayMs.toLong(),
                )
                if (order == null) {
                    promise.resolve(null)
                } else {
                    val result = Arguments.createArray()
                    order.forEach { result.pushString(it) }
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }
}
