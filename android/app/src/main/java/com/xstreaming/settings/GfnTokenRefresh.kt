package com.xstreaming.settings

import android.content.Context
import com.google.gson.Gson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.FormBody

/**
 * Kotlin port of auth.ts's token-refresh/client-token-bootstrap machinery
 * (getValidTokens/ensureClientToken/refreshWithBestMethod/
 * requestClientToken/refreshAuthTokens/refreshWithClientToken) --
 * GfnDeviceAuthClient.kt's own sign-in flow deliberately left all of this
 * out (see its own doc comment). Needed by every GFN feature that calls a
 * GFN API after sign-in (playtime, queue, resync, region list): the
 * device-code flow's own access token is short-lived, and a Settings
 * screen visit can easily happen hours after the last sign-in.
 */
object GfnTokenRefresh {
    private val gson = Gson()

    private const val CLIENT_TOKEN_ENDPOINT = "https://login.nvidia.com/client_token"

    // Refresh proactively once the access/id token is within this window of
    // expiry.
    private const val REFRESH_WINDOW_MS = 10 * 60 * 1000L

    // Same idea for the client token (see ensureClientToken() below).
    private const val CLIENT_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000L

    private fun toExpiresAt(expiresInSeconds: Long?, defaultSeconds: Long = 86400L): Long =
        System.currentTimeMillis() + (expiresInSeconds ?: defaultSeconds) * 1000

    // The `exp` (ms) of a JWT, or null if it can't be read.
    private fun jwtExpiresAt(token: String?): Long? =
        decodeJwtClaims(token)?.let { longOrNull(it, "exp") }?.let { it * 1000 }

    // The `sub` claim of a JWT (NVIDIA's own user id).
    private fun jwtSub(token: String?): String? = decodeJwtClaims(token)?.let { stringOrNull(it, "sub") }

    // The effective expiry: the earliest of the access-token expiry and the
    // id_token's own exp -- the id_token is what authorizes CloudMatch, and
    // it can expire before the access token.
    private fun effectiveExpiresAt(tokens: GfnTokens): Long =
        jwtExpiresAt(tokens.idToken)?.let { minOf(tokens.expiresAt, it) } ?: tokens.expiresAt

    // Mirrors refreshAuthTokens(): plain OAuth refresh_token grant. No
    // `scope` param, matching the TS version's own comment on why.
    private suspend fun refreshAuthTokens(refreshToken: String, authClientId: String): GfnTokens {
        val body = FormBody.Builder()
            .add("grant_type", "refresh_token")
            .add("refresh_token", refreshToken)
            .add("client_id", authClientId)
            .build()
        val request = GfnHttp.requestBuilder(GfnHttp.FORM_CONTENT_TYPE).url(GfnHttp.TOKEN_ENDPOINT).post(body).build()
        val (code, bodyText) = GfnHttp.execute(request)
        if (code !in 200..299) {
            throw GfnDeviceAuthFailed("GFN token refresh failed ($code): ${bodyText.take(300)}")
        }
        val json = parseJsonObjectOrNull(bodyText)
        return GfnTokens(
            accessToken = stringOrNull(json, "access_token") ?: "",
            refreshToken = stringOrNull(json, "refresh_token") ?: refreshToken,
            idToken = stringOrNull(json, "id_token"),
            clientToken = stringOrNull(json, "client_token"),
            expiresAt = toExpiresAt(longOrNull(json, "expires_in")),
            authClientId = authClientId,
        )
    }

    // Mirrors requestClientToken(): asks for NVIDIA's own long-session
    // client token using a still-valid access token.
    private suspend fun requestClientToken(accessToken: String): Pair<String, Long>? {
        val request = GfnHttp.requestBuilder()
            .url(CLIENT_TOKEN_ENDPOINT)
            .header("Authorization", "Bearer $accessToken")
            .build()
        val (code, bodyText) = GfnHttp.execute(request)
        if (code !in 200..299) {
            return null
        }
        val json = parseJsonObjectOrNull(bodyText)
        val clientToken = stringOrNull(json, "client_token") ?: return null
        return clientToken to toExpiresAt(longOrNull(json, "expires_in"))
    }

    // Mirrors refreshWithClientToken(): NVIDIA's own client_token grant
    // (not part of standard OAuth2/OIDC).
    private suspend fun refreshWithClientToken(clientToken: String, userId: String, authClientId: String): GfnTokens {
        val body = FormBody.Builder()
            .add("grant_type", "urn:ietf:params:oauth:grant-type:client_token")
            .add("client_token", clientToken)
            .add("client_id", authClientId)
            .add("sub", userId)
            .build()
        val request = GfnHttp.requestBuilder(GfnHttp.FORM_CONTENT_TYPE).url(GfnHttp.TOKEN_ENDPOINT).post(body).build()
        val (code, bodyText) = GfnHttp.execute(request)
        if (code !in 200..299) {
            throw GfnDeviceAuthFailed("GFN client-token refresh failed ($code): ${bodyText.take(300)}")
        }
        val json = parseJsonObjectOrNull(bodyText)
        if (stringOrNull(json, "access_token").isNullOrEmpty()) {
            throw GfnDeviceAuthFailed("GFN client-token refresh response was missing access_token")
        }
        return GfnTokens(
            accessToken = stringOrNull(json, "access_token")!!,
            refreshToken = stringOrNull(json, "refresh_token"),
            idToken = stringOrNull(json, "id_token"),
            clientToken = stringOrNull(json, "client_token"),
            expiresAt = toExpiresAt(longOrNull(json, "expires_in")),
            authClientId = authClientId,
        )
    }

    // Mirrors refreshWithBestMethod(): client-token grant first (NVIDIA's
    // real long-session mechanism), falling back to the plain refresh_token
    // grant.
    private suspend fun refreshWithBestMethod(tokens: GfnTokens): GfnTokens {
        if (tokens.clientToken != null) {
            val userId = jwtSub(tokens.idToken) ?: jwtSub(tokens.accessToken)
            if (userId != null) {
                try {
                    return refreshWithClientToken(tokens.clientToken, userId, tokens.authClientId)
                } catch (e: Exception) {
                    // Fall through to the refresh_token grant below.
                }
            }
        }
        val refreshToken = tokens.refreshToken
            ?: throw GfnDeviceAuthFailed("No refresh token or client token available")
        return refreshAuthTokens(refreshToken, tokens.authClientId)
    }

    // Mirrors refreshOnce()/inFlightRefresh: multiple concurrent callers
    // (e.g. a playtime load and a queue-status load both firing on the same
    // Settings screen visit) must share one in-flight refresh. NVIDIA
    // rotates refresh tokens (each use invalidates the previous one), so two
    // independent refresh calls racing the same stale token would make the
    // loser's request fail outright.
    //
    // The TS original's own equivalent is a plain "check inFlightRefresh,
    // else create it" with no lock at all -- safe there only because JS is
    // single-threaded (nothing can run between the check and the set).
    // Coroutines on Dispatchers.IO are real threads, so that same
    // check-then-set here would be a genuine race: a Mutex makes "check,
    // and if absent create" one atomic step; the actual network call runs
    // AFTER releasing the lock, so concurrent callers only ever contend for
    // the brief moment of deciding who's in charge, not for the request's
    // full duration.
    private val refreshLock = Mutex()
    private var inFlightRefresh: CompletableDeferred<GfnTokens>? = null

    private suspend fun refreshOnce(tokens: GfnTokens): GfnTokens {
        val (deferred, isOwner) = refreshLock.withLock {
            val existing = inFlightRefresh
            if (existing != null) {
                existing to false
            } else {
                val created = CompletableDeferred<GfnTokens>()
                inFlightRefresh = created
                created to true
            }
        }
        if (!isOwner) {
            return deferred.await()
        }
        try {
            val result = refreshWithBestMethod(tokens)
            deferred.complete(result)
            return result
        } catch (e: Throwable) {
            deferred.completeExceptionally(e)
            throw e
        } finally {
            refreshLock.withLock { inFlightRefresh = null }
        }
    }

    // Mirrors ensureClientToken(): one last chance to capture a client
    // token (NVIDIA's long-session mechanism) before it's needed, using
    // whatever life the access token has left, same ordering as OpenNOW's
    // own SessionValidityCoordinator (the reference auth.ts itself was
    // ported from). Same atomic check-and-create reasoning as refreshOnce()
    // above.
    private val clientTokenBootstrapLock = Mutex()
    private var inFlightClientTokenBootstrap: CompletableDeferred<Pair<String, Long>?>? = null

    private suspend fun ensureClientToken(tokens: GfnTokens): GfnTokens {
        val hasUsable = tokens.clientToken != null &&
            (tokens.clientTokenExpiresAt ?: 0L) - System.currentTimeMillis() > CLIENT_TOKEN_REFRESH_WINDOW_MS
        if (hasUsable) {
            return tokens
        }
        val (deferred, isOwner) = clientTokenBootstrapLock.withLock {
            val existing = inFlightClientTokenBootstrap
            if (existing != null) {
                existing to false
            } else {
                val created = CompletableDeferred<Pair<String, Long>?>()
                inFlightClientTokenBootstrap = created
                created to true
            }
        }
        val result = if (!isOwner) {
            deferred.await()
        } else {
            try {
                val bootstrapped = try {
                    requestClientToken(tokens.accessToken)
                } catch (e: Exception) {
                    null
                }
                deferred.complete(bootstrapped)
                bootstrapped
            } finally {
                clientTokenBootstrapLock.withLock { inFlightClientTokenBootstrap = null }
            }
        }
        return if (result == null) tokens else tokens.copy(clientToken = result.first, clientTokenExpiresAt = result.second)
    }

    // Mirrors getValidTokens(): returns a valid token set, refreshing (and
    // re-persisting) if it is expired or close to it. null only when there
    // is no session, or the current tokens have actually expired and a
    // refresh could not get fresh ones.
    //
    // Takes a Context and calls ensureMmkvInitialized() first, like every
    // other MMKV entry point in this package -- unlike GfnDeviceAuthClient's
    // sign-in flow (only ever reachable from within an already-running
    // SettingsActivity), this is meant to be called by any GFN feature
    // (playtime, queue, resync) that could in principle run as the first
    // code in a freshly-recreated process, before any Settings screen has.
    suspend fun getValidTokens(context: Context): GfnTokens? {
        ensureMmkvInitialized(context)
        val tokens = parseJsonObjectOrNull(NativeSettingsStore.nativeGetGfnTokensJson())
            ?.let { gson.fromJson(it, GfnTokens::class.java) }
            ?: return null
        val expiry = effectiveExpiresAt(tokens)
        val expired = expiry <= System.currentTimeMillis()

        val withClientToken = if (expired) tokens else ensureClientToken(tokens)
        if (withClientToken !== tokens) {
            NativeSettingsStore.nativeSetGfnTokensJson(gson.toJson(withClientToken))
        }

        if (expiry - System.currentTimeMillis() > REFRESH_WINDOW_MS) {
            return withClientToken
        }
        if (withClientToken.refreshToken == null && withClientToken.clientToken == null) {
            return if (expiry > System.currentTimeMillis()) withClientToken else null
        }
        return try {
            val oldIdValid = (jwtExpiresAt(tokens.idToken) ?: 0L) > System.currentTimeMillis()
            val refreshed = refreshOnce(withClientToken)
            // refreshWithClientToken()'s own response often omits
            // refresh_token entirely (unlike refreshAuthTokens(), which
            // already falls back to the token it was given) -- mirrors
            // getValidTokens()'s own top-level merge, which applies this
            // fallback regardless of which of the two refresh methods
            // produced `refreshed`.
            var merged = refreshed.copy(
                refreshToken = refreshed.refreshToken ?: withClientToken.refreshToken,
                idToken = refreshed.idToken ?: (if (oldIdValid) tokens.idToken else null),
                clientToken = refreshed.clientToken ?: withClientToken.clientToken,
                clientTokenExpiresAt = if (refreshed.clientToken != null) null else withClientToken.clientTokenExpiresAt,
            )
            // Give the freshly-refreshed access token a chance to (re)obtain
            // a client token for the next refresh cycle too, same as
            // OpenNOW does right after every successful refresh.
            merged = ensureClientToken(merged)
            NativeSettingsStore.nativeSetGfnTokensJson(gson.toJson(merged))
            merged
        } catch (e: Exception) {
            // Refresh failed -- a transient/network error, or this call
            // lost a race against a concurrent refresh that already
            // consumed the same refresh token. If the tokens we already
            // have haven't actually expired yet, keep using them instead
            // of forcing a sign-out; the next call retries.
            if (expiry > System.currentTimeMillis()) withClientToken else null
        }
    }

    // Mirrors getValidGfnJwt(): NVIDIA's clients send the OpenID id_token as
    // `GFNJWT <token>`; fall back to the access token only if no id_token
    // is present.
    suspend fun getValidGfnJwt(context: Context): String? = getValidTokens(context)?.let { it.idToken ?: it.accessToken }

    // Mirrors getValidGfnUserId(): NVIDIA's own user id (the `sub` claim),
    // needed by APIs like MES (subscription/quota) that key data per-user.
    suspend fun getValidGfnUserId(context: Context): String? =
        getValidTokens(context)?.let { jwtSub(it.idToken) ?: jwtSub(it.accessToken) }
}
