package com.xstreaming.xcloud

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.google.gson.annotations.SerializedName
import com.xstreaming.gfn.GfnWebRtcFactory
import org.webrtc.AudioTrack
import org.webrtc.VideoTrack

// JSON shapes exchanged with lib/webrtc-native/index.ts. Field names use
// @SerializedName to keep the wire format's PascalCase (InputFrame, as
// Channel/Input.ts defines it) while staying idiomatic Kotlin locally.
private data class GamepadFrameDto(
    @SerializedName("GamepadIndex") val gamepadIndex: Int = 0,
    @SerializedName("Nexus") val nexus: Int = 0,
    @SerializedName("Menu") val menu: Int = 0,
    @SerializedName("View") val view: Int = 0,
    @SerializedName("A") val a: Int = 0,
    @SerializedName("B") val b: Int = 0,
    @SerializedName("X") val x: Int = 0,
    @SerializedName("Y") val y: Int = 0,
    @SerializedName("DPadUp") val dpadUp: Int = 0,
    @SerializedName("DPadDown") val dpadDown: Int = 0,
    @SerializedName("DPadLeft") val dpadLeft: Int = 0,
    @SerializedName("DPadRight") val dpadRight: Int = 0,
    @SerializedName("LeftShoulder") val leftShoulder: Int = 0,
    @SerializedName("RightShoulder") val rightShoulder: Int = 0,
    @SerializedName("LeftThumb") val leftThumb: Int = 0,
    @SerializedName("RightThumb") val rightThumb: Int = 0,
    @SerializedName("LeftThumbXAxis") val leftThumbXAxis: Double = 0.0,
    @SerializedName("LeftThumbYAxis") val leftThumbYAxis: Double = 0.0,
    @SerializedName("RightThumbXAxis") val rightThumbXAxis: Double = 0.0,
    @SerializedName("RightThumbYAxis") val rightThumbYAxis: Double = 0.0,
    @SerializedName("LeftTrigger") val leftTrigger: Double = 0.0,
    @SerializedName("RightTrigger") val rightTrigger: Double = 0.0,
) {
    fun toFrame() = XcloudGamepadFrame(
        gamepadIndex, nexus, menu, view, a, b, x, y, dpadUp, dpadDown, dpadLeft, dpadRight,
        leftShoulder, rightShoulder, leftThumb, rightThumb,
        leftThumbXAxis, leftThumbYAxis, rightThumbXAxis, rightThumbYAxis, leftTrigger, rightTrigger,
    )
}

// Mirrors Channel/Input.ts's PointerWireData (already lowerCamelCase there).
private data class PointerEventDto(
    val height: Double = 0.0,
    val pressure: Double = 0.0,
    val twist: Double = 0.0,
    val width: Double = 0.0,
    val pointerId: Double = 0.0,
    val x: Double = 0.0,
    val y: Double = 0.0,
    val type: String = "",
    val clientHeight: Double? = null,
    val clientWidth: Double? = null,
) {
    fun toEvent() = XcloudPointerEvent(height, pressure, twist, width, pointerId, x, y, type, clientHeight, clientWidth)
}

private data class IceCandidateDto(
    val candidate: String = "",
    val sdpMid: String? = null,
    val sdpMLineIndex: Double? = null,
)

/**
 * RN bridge for [XcloudWebRtcClient] -- see that class's doc comment for the
 * overall architecture (native PeerConnection/data-channel transport +
 * binary input protocol, JSON control/chat/message channels reused
 * unchanged from JS via sendChannelMessage/XcloudChannel* events). JS still
 * does the actual SDP/ICE REST exchange with Xbox's servers
 * (xcloudSessionClient.ts, untouched) -- this module only hands it the
 * local offer / takes the remote answer and ICE candidates.
 */
class XcloudWebRtcModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val gson = Gson()
    private var client: XcloudWebRtcClient? = null
    private var remoteAudioTrack: AudioTrack? = null
    private var currentVideoTrackId: String? = null
    // Bumped on every init() (and dispose()) so a stale client's callbacks
    // -- its PeerConnection's dispose() doesn't guarantee its Observer stops
    // posting onAddTrack/onConnectionChange/data-channel events
    // synchronously -- can tell they no longer belong to the current
    // connection and no-op instead of overwriting state for a newer one.
    // Same race GfnWebRtcModule guards against; see its own comment.
    // @Volatile: those callbacks run on WebRTC's own threads, not this RN
    // module's; without it a callback thread could read a cached, stale
    // value and pass the check it exists to fail. Bumped before dispose()
    // is called, not after, so a callback racing the dispose() call itself
    // already sees the new generation.
    @Volatile
    private var connectGeneration = 0

    override fun getName(): String = "XcloudWebRtcModule"

    private fun emit(eventName: String, payload: com.facebook.react.bridge.WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, payload)
        } catch (ignored: Exception) {
        }
    }

    private fun emitTrack(kind: String, trackId: String) {
        val payload = Arguments.createMap()
        payload.putString("kind", kind)
        payload.putString("trackId", trackId)
        emit("XcloudTrackReady", payload)
    }

    private fun emitState(state: String, detail: String?) {
        val payload = Arguments.createMap()
        payload.putString("state", state)
        if (detail != null) payload.putString("detail", detail) else payload.putNull("detail")
        emit("XcloudStateChanged", payload)
    }

    @ReactMethod
    fun init() {
        val myGeneration = ++connectGeneration
        val current = { myGeneration == connectGeneration }
        client?.dispose()
        currentVideoTrackId?.let { com.xstreaming.webrtc.NativeVideoTrackHolder.clearTrack(it) }
        currentVideoTrackId = null
        remoteAudioTrack = null
        val factory = GfnWebRtcFactory.get(reactApplicationContext)
        val newClient = XcloudWebRtcClient(
            factory = factory,
            onTrack = { video: VideoTrack?, audio: AudioTrack? ->
                if (current()) {
                    video?.let {
                        val id = "xcloud-${it.id()}"
                        com.xstreaming.webrtc.NativeVideoTrackHolder.setTrack(id, it)
                        currentVideoTrackId = id
                        emitTrack("video", id)
                    }
                    audio?.let {
                        remoteAudioTrack = it
                        emitTrack("audio", it.id())
                    }
                }
            },
            onState = { state, detail -> if (current()) emitState(state, detail) },
            onChannelOpen = { name ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putString("channel", name)
                    emit("XcloudChannelOpen", payload)
                }
            },
            onChannelMessage = { name, data ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putString("channel", name)
                    payload.putString("data", data)
                    emit("XcloudChannelMessage", payload)
                }
            },
            onChannelClose = { name ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putString("channel", name)
                    emit("XcloudChannelClose", payload)
                }
            },
            onLocalIceCandidate = { c ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putString("candidate", c.sdp)
                    if (c.sdpMid != null) payload.putString("sdpMid", c.sdpMid) else payload.putNull("sdpMid")
                    payload.putDouble("sdpMLineIndex", c.sdpMLineIndex.toDouble())
                    emit("XcloudLocalIceCandidate", payload)
                }
            },
            onRenegotiationOffer = { sdp ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putString("sdp", sdp)
                    emit("XcloudRenegotiationOffer", payload)
                }
            },
            onRumble = { rumble ->
                if (current()) {
                    val payload = Arguments.createMap()
                    payload.putInt("startDelay", rumble.startDelay)
                    payload.putInt("duration", rumble.duration)
                    payload.putDouble("weakMagnitude", rumble.weakMagnitude)
                    payload.putDouble("strongMagnitude", rumble.strongMagnitude)
                    payload.putDouble("leftTrigger", rumble.leftTrigger)
                    payload.putDouble("rightTrigger", rumble.rightTrigger)
                    payload.putInt("delayMs", rumble.delayMs)
                    payload.putInt("repeat", rumble.repeat)
                    emit("XcloudRumble", payload)
                }
            },
        )
        client = newClient
        newClient.init()
    }

    @ReactMethod
    fun createOffer(promise: Promise) {
        val current = client ?: run { promise.reject("not_initialized", "call init() first"); return }
        current.createOffer { offer, error ->
            if (offer != null) {
                val result = Arguments.createMap()
                result.putString("sdp", offer.description)
                result.putString("type", "offer")
                promise.resolve(result)
            } else {
                promise.reject("create_offer_failed", error ?: "unknown error")
            }
        }
    }

    @ReactMethod
    fun setRemoteOffer(sdp: String, promise: Promise) {
        val current = client ?: run { promise.reject("not_initialized", "call init() first"); return }
        current.setRemoteOffer(sdp) { error ->
            if (error == null) promise.resolve(true) else promise.reject("set_remote_offer_failed", error)
        }
    }

    @ReactMethod
    fun setIceCandidates(iceDetailsJson: String) {
        try {
            val type = com.google.gson.reflect.TypeToken.getParameterized(List::class.java, IceCandidateDto::class.java).type
            val dtos = gson.fromJson<List<IceCandidateDto>>(iceDetailsJson, type) ?: return
            client?.addRemoteIceCandidates(
                dtos.map { XcloudIceCandidateInfo(it.candidate, it.sdpMid, it.sdpMLineIndex?.toInt()) },
            )
        } catch (e: Exception) {
        }
    }

    @ReactMethod
    fun close() {
        connectGeneration++
        client?.dispose()
        client = null
        currentVideoTrackId?.let { com.xstreaming.webrtc.NativeVideoTrackHolder.clearTrack(it) }
        currentVideoTrackId = null
        remoteAudioTrack = null
    }

    @ReactMethod
    fun setGamepadState(json: String) {
        try {
            val parsed = JsonParser.parseString(json)
            val frames = if (parsed.isJsonArray) {
                val type = com.google.gson.reflect.TypeToken.getParameterized(List::class.java, GamepadFrameDto::class.java).type
                gson.fromJson<List<GamepadFrameDto>>(parsed, type) ?: emptyList()
            } else {
                listOf(gson.fromJson(parsed, GamepadFrameDto::class.java))
            }
            client?.setGamepadState(frames.map { it.toFrame() })
        } catch (e: Exception) {
        }
    }

    @ReactMethod
    fun setPollRate(hz: Double) {
        client?.setPollRate(hz)
    }

    @ReactMethod
    fun setMaxTouchPoints(value: Double) {
        client?.setMaxTouchPoints(value.toInt())
    }

    @ReactMethod
    fun queuePointerInput(json: String) {
        try {
            val type = com.google.gson.reflect.TypeToken.getParameterized(List::class.java, PointerEventDto::class.java).type
            val dtos = gson.fromJson<List<PointerEventDto>>(json, type) ?: return
            client?.queuePointerInput(dtos.map { it.toEvent() })
        } catch (e: Exception) {
        }
    }

    @ReactMethod
    fun addProcessedFrame(
        serverDataKey: Double,
        firstFramePacketArrivalTimeMs: Double,
        frameSubmittedTimeMs: Double,
        frameDecodedTimeMs: Double,
        frameRenderedTimeMs: Double,
    ) {
        client?.addProcessedFrame(
            XcloudMetadataFrame(
                serverDataKey, firstFramePacketArrivalTimeMs, frameSubmittedTimeMs,
                frameDecodedTimeMs, frameRenderedTimeMs,
            ),
        )
    }

    @ReactMethod
    fun startInput() {
        client?.startInput()
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
    fun setRemoteAudioVolume(volume: Double) {
        try {
            remoteAudioTrack?.setVolume(volume)
        } catch (ignored: Exception) {
        }
    }

    @ReactMethod
    fun getStats(promise: Promise) {
        val current = client
        if (current == null) {
            promise.resolve(null)
            return
        }
        current.getStats { report ->
            promise.resolve(com.xstreaming.webrtc.StatsReportConverter.toWritableArray(report))
        }
    }

    @ReactMethod
    fun sendChannelMessage(channel: String, text: String) {
        client?.sendOnChannel(channel, text)
    }

    // Required so NativeEventEmitter doesn't warn on the JS side.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}
}
