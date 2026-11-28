package com.xstreaming.settings

import android.content.Context
import android.util.Base64
import com.google.gson.JsonParser
import com.xstreaming.R

/**
 * Read-only Kotlin port of the account-status logic
 * src/pages/settings/model/useSettingsScreen.ts and
 * src/entities/gfn-account/model/auth.ts compute for the GFN/Xbox account
 * rows -- whether each is signed in, and what name/plan to show. No JS/RN
 * bridge: reads the same MMKV keys those JS modules already write
 * ("gfn.tokens", "user.tokenstore", "xbox.profile.cache") via
 * NativeSettingsStore. GFN's own sign-in/sign-out IS ported natively now
 * (see GfnDeviceAuthClient.kt/GfnSignInDialog.kt, wired up from
 * AccountSection.kt) -- this file just displays the result either way.
 * Xbox's sign-in/sign-out (XAL/MSAL, an interactive WebView) is not yet;
 * that's a separate, later phase.
 */
data class AccountDisplay(val signedIn: Boolean, val userName: String?, val planTitle: String?)

// parseJsonObjectOrNull/stringOrNull/objOrNull are shared with
// GfnDeviceAuthClient.kt -- see JsonHelpers.kt.

// Mirrors auth.ts's nameFromJwt(): decodes a JWT's payload segment
// (base64url, manually padded since JWTs omit the trailing '='s Android's
// own decoder requires) and reads preferred_username, falling back to the
// local part of email.
private fun nameFromJwt(token: String?): String? {
    if (token.isNullOrEmpty()) {
        return null
    }
    val payload = token.split(".").getOrNull(1) ?: return null
    return try {
        val padded = payload + "=".repeat((4 - payload.length % 4) % 4)
        val decoded = Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
        val claims = JsonParser.parseString(String(decoded, Charsets.UTF_8)).asJsonObject
        val preferred = stringOrNull(claims, "preferred_username")
        if (!preferred.isNullOrEmpty()) {
            return preferred
        }
        val email = stringOrNull(claims, "email")
        // Matches the JS version's `claims.email.split('@')[0] || null`:
        // an empty local part (e.g. "@example.com") is null, not "".
        if (email != null && email.contains("@")) email.substringBefore("@").ifEmpty { null } else null
    } catch (e: Exception) {
        null
    }
}

// Mirrors auth.ts's getStoredTokens()/isSignedIn()/getGfnDisplayName()
// exactly: signed-in is purely local presence of a stored accessToken, with
// no expiry check and no network call -- see that file's own comment for
// why (this mirrors useGfnSignIn()'s initial `signedIn` state too, which
// reads the identical isSignedIn()).
fun getGfnAccountStatus(context: Context): AccountDisplay {
    ensureMmkvInitialized(context)
    val tokens = parseJsonObjectOrNull(NativeSettingsStore.nativeGetGfnTokensJson())
    val accessToken = stringOrNull(tokens, "accessToken")
    if (accessToken.isNullOrEmpty()) {
        return AccountDisplay(signedIn = false, userName = null, planTitle = null)
    }
    val userName = nameFromJwt(stringOrNull(tokens, "idToken")) ?: nameFromJwt(accessToken)
    return AccountDisplay(signedIn = true, userName = userName, planTitle = null)
}

// Mirrors useSettingsScreen.ts's isAuthed/user/xboxAccount computation
// byte-for-byte, INCLUDING its own apparent inconsistency: the gamertag
// fallback reads DisplayClaims.xui[0].mgt, not .gtg (what this app's own
// SisuToken.getGamertag() elsewhere actually reads) -- kept exactly as the
// live JS behavior is, not "fixed", since this only shows the same stored
// data the JS screen already shows this way.
fun getXboxAccountStatus(context: Context): AccountDisplay {
    ensureMmkvInitialized(context)
    val store = parseJsonObjectOrNull(NativeSettingsStore.nativeGetXboxTokenStoreJson())

    var isAuthed = false
    var fallbackName: String? = null

    val authorizationToken = objOrNull(objOrNull(store, "sisuToken"), "AuthorizationToken")
    if (authorizationToken != null) {
        isAuthed = true
        fallbackName = try {
            val xui = objOrNull(authorizationToken, "DisplayClaims")?.getAsJsonArray("xui")
            val first = xui?.firstOrNull()?.takeIf { it.isJsonObject }?.asJsonObject
            stringOrNull(first, "mgt")
        } catch (e: Exception) {
            null
        }
    }

    if (!stringOrNull(objOrNull(store, "userToken"), "access_token").isNullOrEmpty()) {
        isAuthed = true
    }

    if (!isAuthed) {
        return AccountDisplay(signedIn = false, userName = null, planTitle = null)
    }

    val profile = objOrNull(parseJsonObjectOrNull(NativeSettingsStore.nativeGetXboxProfileCacheJson()), "profile")
    val gamertag = stringOrNull(profile, "gamertag")
    val userName = if (!gamertag.isNullOrEmpty()) gamertag else fallbackName
    val planTitle = if (stringOrNull(profile, "accountTier") == "Gold") {
        context.getString(R.string.XboxGamePassActive)
    } else {
        null
    }
    return AccountDisplay(signedIn = true, userName = userName, planTitle = planTitle)
}
