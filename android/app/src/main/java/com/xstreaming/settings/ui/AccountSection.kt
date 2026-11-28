package com.xstreaming.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.xstreaming.R
import com.xstreaming.settings.getGfnAccountStatus
import com.xstreaming.settings.getXboxAccountStatus

/** A section header, matching shared/ui/SettingRows' SectionLabel look. */
@Composable
fun SectionLabel(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
    )
}

/**
 * A title + description row. Sign-in/out and token-copy (the JS screen's
 * onPress/onLongPress here) aren't ported to Kotlin in this phase, but the
 * signed-out description text is reused verbatim from that JS screen and
 * literally says "tap to sign in" -- so tapping has to do SOMETHING, not
 * nothing: it hands control back to the caller (SettingsActivity's
 * onBack), landing the user on the JS Settings screen's own account row,
 * where signing in/out actually works today.
 */
@Composable
private fun AccountRow(title: String, description: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// Mirrors SettingsView.tsx's signedInText(): "Current user: <name>" with
// " · <plan>" appended when there's a plan to show, or null (meaning the
// caller falls back to its own plain "signed in" string) when there's no
// name to show at all.
@Composable
private fun signedInText(userName: String?, plan: String?): String? {
    if (userName.isNullOrEmpty()) {
        return null
    }
    val current = stringResource(R.string.current_user)
    return if (!plan.isNullOrEmpty()) "$current: $userName · $plan" else "$current: $userName"
}

/**
 * Read-only GFN/Xbox account status rows -- see AccountStatus.kt (Kotlin
 * port of useSettingsScreen.ts's isAuthed/gfnSignedIn/xboxAccount/
 * gfnAccount computation) for what each shows. Tapping either row doesn't
 * sign in/out here (not ported yet); it calls [onBack] instead, same as
 * this screen's back button -- see AccountRow's own comment for why.
 */
@Composable
fun AccountSection(onBack: () -> Unit) {
    val context = LocalContext.current
    val gfn = remember { getGfnAccountStatus(context) }
    val xbox = remember { getXboxAccountStatus(context) }

    SectionLabel(stringResource(R.string.SectionAccount))
    AccountRow(
        title = stringResource(R.string.GfnAccountTitle),
        description = if (gfn.signedIn) {
            signedInText(gfn.userName, gfn.planTitle) ?: stringResource(R.string.GfnSignedIn)
        } else {
            stringResource(R.string.GfnAccountSignedOutDesc)
        },
        onClick = onBack,
    )
    AccountRow(
        title = stringResource(R.string.XboxAccountTitle),
        description = if (xbox.signedIn) {
            signedInText(xbox.userName, xbox.planTitle) ?: stringResource(R.string.XcloudAccountSignedInDesc)
        } else {
            stringResource(R.string.XcloudAccountSignedOutDesc)
        },
        onClick = onBack,
    )
}
