package com.xstreaming.settings.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.jakewharton.processphoenix.ProcessPhoenix

/**
 * Mirrors useSettingsScreen.ts's restart()/restartDelayed(): a short delay so
 * the UI's own new value is visibly applied before the process restarts (the
 * JS versions are two chained setTimeouts -- restart() 500ms, restartDelayed()
 * 500+500ms). RNRestart.restart() is itself just ProcessPhoenix.triggerRebirth()
 * under the hood (see node_modules/react-native-restart's RestartModule.java)
 * -- called here directly, no RN bridge involved.
 */
private fun restartAfter(context: Context, delayMs: Long) {
    Handler(Looper.getMainLooper()).postDelayed({
        ProcessPhoenix.triggerRebirth(context)
    }, delayMs)
}

internal fun restartApp(context: Context) = restartAfter(context, 500L)

internal fun restartAppDelayed(context: Context) = restartAfter(context, 1000L)
