package com.xstreaming.settings.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.xstreaming.R
import com.xstreaming.settings.GfnDeviceAuthCancelled
import com.xstreaming.settings.GfnDeviceAuthClient
import com.xstreaming.settings.GfnDeviceChallenge
import kotlinx.coroutines.CancellationException

private sealed class GfnSignInUiState {
    object Starting : GfnSignInUiState()
    data class Waiting(val challenge: GfnDeviceChallenge) : GfnSignInUiState()
    // Mirrors GfnSignInModal.tsx exactly: the failed state always shows the
    // same generic GfnLoginFailed text, never the specific exception
    // message, so there's nothing to carry here.
    object Failed : GfnSignInUiState()
}

/**
 * Kotlin/Compose port of src/entities/gfn-account/ui/GfnSignInModal.tsx,
 * driving GfnDeviceAuthClient's requestDeviceAuthorization()/
 * pollForTokens() end to end: request a challenge, show the user code and
 * a button to open NVIDIA's verification page, then poll until signed in
 * (or cancelled/failed/expired). Reuses that same JS component's wording
 * (GfnLoginTitle/GfnLoginInstruction/GfnLoginOpen/GfnLoginWaiting/
 * GfnLoginFailed/Retry/Cancel), not new English-only text.
 */
@Composable
fun GfnSignInDialog(onDismiss: () -> Unit, onSignedIn: () -> Unit) {
    val context = LocalContext.current
    var uiState by remember { mutableStateOf<GfnSignInUiState>(GfnSignInUiState.Starting) }
    var cancelled by remember { mutableStateOf(false) }
    var retryKey by remember { mutableStateOf(0) }
    val onSignedInState = rememberUpdatedState(onSignedIn)

    LaunchedEffect(retryKey) {
        uiState = GfnSignInUiState.Starting
        try {
            val challenge = GfnDeviceAuthClient.requestDeviceAuthorization()
            uiState = GfnSignInUiState.Waiting(challenge)
            GfnDeviceAuthClient.pollForTokens(challenge) { cancelled }
            onSignedInState.value()
        } catch (e: GfnDeviceAuthCancelled) {
            // Dismissed by the user -- no error to show.
        } catch (e: CancellationException) {
            // The coroutine itself was cancelled (e.g. this composable left
            // the composition) for a reason OTHER than the explicit
            // cancelled flag above -- rethrow, don't swallow it as a
            // "failed" sign-in: structured concurrency requires letting a
            // real cancellation keep propagating.
            throw e
        } catch (e: Exception) {
            uiState = GfnSignInUiState.Failed
        }
    }

    AlertDialog(
        onDismissRequest = {
            cancelled = true
            onDismiss()
        },
        title = { Text(stringResource(R.string.GfnLoginTitle)) },
        text = {
            when (val state = uiState) {
                is GfnSignInUiState.Starting -> CircularProgressIndicator()
                is GfnSignInUiState.Waiting -> Column {
                    Text(stringResource(R.string.GfnLoginInstruction))
                    Spacer(modifier = Modifier.height(8.dp))
                    // Shown as plain text, not just inside the "Open in
                    // browser" button below: some Android TV/kiosk-style
                    // devices this app targets (see the manifest's
                    // LEANBACK_LAUNCHER intent filter) have no app that
                    // handles ACTION_VIEW for an https:// link at all, so
                    // this is the only way to actually finish sign-in
                    // there -- type this URL in on another device.
                    Text(state.challenge.verificationUri, style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(state.challenge.userCode, style = MaterialTheme.typography.headlineMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(state.challenge.verificationUriComplete))
                        try {
                            context.startActivity(intent)
                        } catch (e: ActivityNotFoundException) {
                            // No browser to hand off to (see the comment on
                            // verificationUri above) -- the URL/code shown
                            // above is this dialog's only other way to
                            // finish sign-in, so there's nothing more to do
                            // here than not crash the Settings screen.
                        }
                    }) {
                        Text(stringResource(R.string.GfnLoginOpen))
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(stringResource(R.string.GfnLoginWaiting))
                }
                GfnSignInUiState.Failed -> Column {
                    Text(stringResource(R.string.GfnLoginFailed))
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(onClick = {
                        cancelled = false
                        retryKey += 1
                    }) {
                        Text(stringResource(R.string.Retry))
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = {
                cancelled = true
                onDismiss()
            }) {
                Text(stringResource(R.string.Cancel))
            }
        },
    )
}
