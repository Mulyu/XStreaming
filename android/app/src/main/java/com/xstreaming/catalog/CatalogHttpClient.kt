package com.xstreaming.catalog

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * One shared OkHttpClient for every catalog-title native fetcher
 * (SteamPriceClient, GfnPublicGamesClient, PopularOrderClient) -- these are
 * all short-lived JSON GETs with the same timeouts, so there's no reason
 * each should allocate its own dispatcher thread pool and connection pool.
 */
object CatalogHttpClient {
    val instance: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
