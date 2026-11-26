package com.xstreaming.gfn

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import org.webrtc.AudioTrack
import org.webrtc.VideoTrack

/**
 * RN bridge for [GfnWebRtcClient] -- the native-module side of this app's
 * first Kotlin WebRTC slice (see the "Kotlin移植性調査" doc this replaces
 * the JS-side GfnWebRtcClient for). JS still does all of session.ts's own
 * CloudMatch REST polling (createGfnSession/pollGfnSession) -- that's a
 * separate HTTP-API concern, not WebRTC -- and hands this module the
 * already-resolved session (signalingUrl, sessionId, iceServers, stream
 * settings) once a seat is ready.
 *
 * Not wired up yet: attaching the remote VideoTrack to a renderer. onTrack
 * below only announces that a track arrived (kind + id) via
 * GfnWebRtcTrackReady -- actually rendering it needs either a new prop on
 * RTCFsrVideoView or a dedicated view, which is a separate decision from
 * porting the WebRTC/signaling layer itself.
 */
class GfnWebRtcModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val gson = Gson()
    private var client: GfnWebRtcClient? = null
    private var remoteAudioTrack: AudioTrack? = null
    private var currentVideoTrackId: String? = null

    override fun getName(): String = "GfnWebRtcModule"

    private fun emit(eventName: String, payload: com.facebook.react.bridge.WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, payload)
        } catch (ignored: Exception) {
        }
    }

    private fun emitState(state: GfnConnectionState, detail: String?) {
        val payload = Arguments.createMap()
        payload.putString("state", state.name)
        if (detail != null) {
            payload.putString("detail", detail)
        } else {
            payload.putNull("detail")
        }
        emit("GfnWebRtcStateChanged", payload)
    }

    private fun emitTrack(kind: String, trackId: String) {
        val payload = Arguments.createMap()
        payload.putString("kind", kind)
        payload.putString("trackId", trackId)
        emit("GfnWebRtcTrackReady", payload)
    }

    @ReactMethod
    fun connect(sessionJson: String, promise: Promise) {
        try {
            val session = gson.fromJson(sessionJson, GfnSessionInfo::class.java)
                ?: throw IllegalArgumentException("empty session")
            client?.dispose()
            currentVideoTrackId?.let { com.xstreaming.webrtc.NativeVideoTrackHolder.clearTrack(it) }
            currentVideoTrackId = null
            remoteAudioTrack = null
            val factory = GfnWebRtcFactory.get(reactApplicationContext)
            val newClient = GfnWebRtcClient(
                session = session,
                factory = factory,
                onTrack = { video: VideoTrack?, audio: AudioTrack? ->
                    video?.let {
                        com.xstreaming.webrtc.NativeVideoTrackHolder.setTrack(it.id(), it)
                        currentVideoTrackId = it.id()
                        emitTrack("video", it.id())
                    }
                    audio?.let {
                        remoteAudioTrack = it
                        emitTrack("audio", it.id())
                    }
                },
                onState = { state, detail -> emitState(state, detail) },
                onMicAvailable = { emit("GfnWebRtcMicAvailable", Arguments.createMap()) },
            )
            client = newClient
            newClient.connect()
            promise.resolve(true)
        } catch (e: JsonSyntaxException) {
            promise.reject("bad_session", "Could not parse session JSON: ${e.message}")
        } catch (e: Exception) {
            promise.reject("connect_error", e.message, e)
        }
    }

    @ReactMethod
    fun dispose() {
        client?.dispose()
        client = null
        currentVideoTrackId?.let { com.xstreaming.webrtc.NativeVideoTrackHolder.clearTrack(it) }
        currentVideoTrackId = null
        remoteAudioTrack = null
    }

    // Mirrors the TS client's remote-audio-track._setVolume(gain) -- used for
    // the background-mute/foreground-restore gain NativeStream already
    // applies. org.webrtc's AudioTrack.setVolume takes 0.0-1.0 (and beyond,
    // though callers here only ever pass [0,1]).
    @ReactMethod
    fun setRemoteAudioVolume(volume: Double) {
        try {
            remoteAudioTrack?.setVolume(volume)
        } catch (ignored: Exception) {
        }
    }

    @ReactMethod
    fun sendGamepad(
        controllerId: Double,
        buttons: Double,
        leftTrigger: Double,
        rightTrigger: Double,
        leftStickX: Double,
        leftStickY: Double,
        rightStickX: Double,
        rightStickY: Double,
    ) {
        client?.sendGamepad(
            GamepadInput(
                controllerId = controllerId.toInt(),
                buttons = buttons.toInt(),
                leftTrigger = leftTrigger.toInt(),
                rightTrigger = rightTrigger.toInt(),
                leftStickX = leftStickX.toInt(),
                leftStickY = leftStickY.toInt(),
                rightStickX = rightStickX.toInt(),
                rightStickY = rightStickY.toInt(),
            ),
        )
    }

    @ReactMethod
    fun sendMouseMove(dx: Double, dy: Double) {
        client?.sendMouseMove(dx.toInt(), dy.toInt())
    }

    @ReactMethod
    fun sendMouseAbsolute(x: Double, y: Double, reliable: Boolean) {
        client?.sendMouseAbsolute(x.toFloat(), y.toFloat(), reliable)
    }

    @ReactMethod
    fun sendMouseButtonDown(button: Double) {
        client?.sendMouseButtonDown(button.toInt())
    }

    @ReactMethod
    fun sendMouseButtonUp(button: Double) {
        client?.sendMouseButtonUp(button.toInt())
    }

    @ReactMethod
    fun sendMouseWheel(delta: Double, horizontal: Double) {
        client?.sendMouseWheel(delta.toInt(), horizontal.toInt())
    }

    @ReactMethod
    fun sendKeyDown(virtualKey: Double, modifiers: Double) {
        client?.sendKeyDown(virtualKey.toInt(), modifiers.toInt())
    }

    @ReactMethod
    fun sendKeyUp(virtualKey: Double, modifiers: Double) {
        client?.sendKeyUp(virtualKey.toInt(), modifiers.toInt())
    }

    @ReactMethod
    fun startMic(promise: Promise) {
        promise.resolve(client?.startMic() ?: false)
    }

    @ReactMethod
    fun stopMic() {
        client?.stopMic()
    }

    @ReactMethod
    fun getStats(promise: Promise) {
        val current = client
        if (current == null) {
            promise.resolve(null)
            return
        }
        current.getStats { report ->
            promise.resolve(report?.toString())
        }
    }

    // Required so NativeEventEmitter doesn't warn on the JS side.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}
}
