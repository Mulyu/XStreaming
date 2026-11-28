package com.xstreaming.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.xstreaming.R
import com.xstreaming.settings.GfnDeviceAuthClient
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

/** A title + description row. */
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
 * Mirrors useSettingsScreen.ts's handleGfnAccountPress(): signed in -> a
 * Warning/GfnSignOutConfirm confirm dialog before signing out; signed out
 * -> starts the device-code sign-in flow (GfnSignInDialog).
 */
@Composable
private fun GfnConfirmSignOutDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.Warning)) },
        text = { Text(stringResource(R.string.GfnSignOutConfirm)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.Confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.Cancel)) }
        },
    )
}

/**
 * GFN/Xbox account status rows -- see AccountStatus.kt (Kotlin port of
 * useSettingsScreen.ts's isAuthed/gfnSignedIn/xboxAccount/gfnAccount
 * computation) for what each shows. GFN now actually signs in/out
 * natively (GfnDeviceAuthClient/GfnSignInDialog). Xbox doesn't yet --
 * that needs XAL/MSAL and an interactive WebView, a separate later phase
 * -- so tapping its row calls [onBack] instead, same as this screen's own
 * back button: its signed-out description text is reused verbatim from
 * the interactive JS screen and literally says "tap to sign in", so
 * tapping has to land somewhere that can actually do that.
 */
@Composable
fun AccountSection(onBack: () -> Unit) {
    val context = LocalContext.current
    var gfn by remember { mutableStateOf(getGfnAccountStatus(context)) }
    val xbox = remember { getXboxAccountStatus(context) }
    var showGfnSignIn by remember { mutableStateOf(false) }
    var showGfnSignOutConfirm by remember { mutableStateOf(false) }

    SectionLabel(stringResource(R.string.SectionAccount))
    AccountRow(
        title = stringResource(R.string.GfnAccountTitle),
        description = if (gfn.signedIn) {
            signedInText(gfn.userName, gfn.planTitle) ?: stringResource(R.string.GfnSignedIn)
        } else {
            stringResource(R.string.GfnAccountSignedOutDesc)
        },
        onClick = {
            if (gfn.signedIn) {
                showGfnSignOutConfirm = true
            } else {
                showGfnSignIn = true
            }
        },
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

    if (showGfnSignIn) {
        GfnSignInDialog(
            onDismiss = { showGfnSignIn = false },
            onSignedIn = {
                showGfnSignIn = false
                gfn = getGfnAccountStatus(context)
            },
        )
    }
    if (showGfnSignOutConfirm) {
        GfnConfirmSignOutDialog(
            onConfirm = {
                showGfnSignOutConfirm = false
                GfnDeviceAuthClient.signOut()
                gfn = getGfnAccountStatus(context)
            },
            onDismiss = { showGfnSignOutConfirm = false },
        )
    }
}
