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
            // connectTimeout/readTimeout alone don't bound the call's total
            // duration -- a response trickling in just fast enough to keep
            // resetting the read timeout could hang indefinitely, unlike
            // the axios calls this replaces, which had a single 15s overall
            // timeout. callTimeout covers the whole call (connect + write +
            // every read) end to end.
            .callTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
