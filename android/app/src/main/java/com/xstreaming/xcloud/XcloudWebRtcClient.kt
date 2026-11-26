package com.xstreaming.xcloud

import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import java.util.Collections
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

data class XcloudRumbleData(
    val startDelay: Int,
    val duration: Int,
    val weakMagnitude: Double,
    val strongMagnitude: Double,
    val leftTrigger: Double,
    val rightTrigger: Double,
    val delayMs: Int,
    val repeat: Int,
)

private object NoopSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}

// Channel names, matching lib/webrtc/index.ts's _webrtcDataChannelsConfig keys.
const val CHANNEL_INPUT = "input"
const val CHANNEL_CHAT = "chat"
const val CHANNEL_CONTROL = "control"
const val CHANNEL_MESSAGE = "message"

/**
 * Kotlin port of features/xcloud-session/lib/webrtc's PeerConnection/data-
 * channel transport (lib/webrtc/index.ts's own PeerConnection handling,
 * Driver/Gamepad.ts's resend loop, and the binary input protocol in
 * Channel/Input.ts + Packet/index.ts), via org.webrtc directly -- no
 * react-native-webrtc / RN bridge in this class.
 *
 * Unlike GfnWebRtcClient (which answers an offer the server sends over its
 * own signaling socket), this client is the OFFERER: it builds the local
 * offer and hands it to JS, which does the SDP/ICE exchange with Xbox's
 * servers over plain REST (xcloudSessionClient.ts, untouched) exactly like
 * the TS webRTCClient did. See XcloudWebRtcModule for that bridge.
 *
 * The JSON-based control/chat/message channels are intentionally NOT
 * reimplemented here -- that protocol (handshake/transactions in
 * Message.ts, JSON control messages in Control.ts) has no hot-path
 * performance concern, so lib/webrtc-native/index.ts on the JS side reuses
 * Control.ts and Message.ts completely unchanged against a shim backed by
 * sendOnChannel/registerChannelObserver below. Only the poll-rate-driven
 * binary input channel is fully native, for the same reason GFN's is.
 */
class XcloudWebRtcClient(
    private val factory: PeerConnectionFactory,
    private val onTrack: (VideoTrack?, AudioTrack?) -> Unit = { _, _ -> },
    private val onState: (String, String?) -> Unit = { _, _ -> },
    private val onChannelOpen: (String) -> Unit = {},
    private val onChannelMessage: (String, String) -> Unit = { _, _ -> },
    private val onChannelClose: (String) -> Unit = {},
    private val onRenegotiationOffer: (String) -> Unit = {},
    // The TS webRTCClient's getIceCandidates() is a plain synchronous array
    // read (_gatherIce() pushes into _iceCandidates as each one arrives) --
    // native-stream/index.tsx calls it that way too, not as a promise. So
    // local candidates are pushed to JS as they're gathered, not pulled on
    // demand; JS keeps its own array and this callback is how it grows.
    private val onLocalIceCandidate: (IceCandidate) -> Unit = {},
    private val onRumble: (XcloudRumbleData) -> Unit = {},
) {
    private var pc: PeerConnection? = null
    private var inputChannel: DataChannel? = null
    private val jsonChannels = mutableMapOf<String, DataChannel>()

    private var audioSender: RtpSender? = null
    private var micSource: AudioSource? = null
    private var micTrack: AudioTrack? = null

    @Volatile private var disposed = false
    private val localIceCandidates = CopyOnWriteArrayList<IceCandidate>()

    private var pollRateHz = 62.5
    private var maxTouchPoints = 0
    @Volatile private var inputSequence = 0
    private var inputLoop: ScheduledExecutorService? = null

    @Volatile private var serverWidth = 1920
    @Volatile private var serverHeight = 1080

    @Volatile private var gamepadFrames: List<XcloudGamepadFrame> = emptyList()
    private val pointerQueue = Collections.synchronizedList(mutableListOf<List<XcloudPointerEvent>>())
    private val metadataQueue = Collections.synchronizedList(mutableListOf<XcloudMetadataFrame>())

    companion object {
        // Same hardcoded STUN list as lib/webrtc/index.ts's
        // _webrtcConfiguration.iceServers.
        private val ICE_SERVER_URLS = listOf(
            "stun:worldaz.relay.teams.microsoft.com:3478",
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:relay1.expressturn.com",
            "stun:relay2.expressturn.com",
            "stun:stun.kinesisvideo.us-east-1.amazonaws.com:443",
            "stun:stun.douyucdn.cn:18000",
        )
    }

    fun init() {
        val iceServers = ICE_SERVER_URLS.map { PeerConnection.IceServer.builder(it).createIceServer() }
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers)

        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                localIceCandidates.add(candidate)
                onLocalIceCandidate(candidate)
            }

            override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<out MediaStream>) {
                when (val track = receiver.track()) {
                    is VideoTrack -> onTrack(track, null)
                    is AudioTrack -> onTrack(null, track)
                    else -> {}
                }
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                val mapped = when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> "connected"
                    PeerConnection.PeerConnectionState.FAILED -> "failed"
                    PeerConnection.PeerConnectionState.DISCONNECTED -> "disconnected"
                    PeerConnection.PeerConnectionState.CLOSED -> "closed"
                    else -> null
                }
                if (mapped != null) {
                    onState(mapped, null)
                }
            }

            override fun onSignalingChange(newState: PeerConnection.SignalingState) {}
            override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {}
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) {}
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
            override fun onAddStream(stream: MediaStream) {}
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(dataChannel: DataChannel) {}
            override fun onRenegotiationNeeded() {}
        }

        val connection = factory.createPeerConnection(rtcConfig, observer)
        if (connection == null) {
            onState("failed", "createPeerConnection returned null")
            return
        }
        pc = connection

        connection.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
        val audioTransceiver = connection.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_RECV),
        )
        audioSender = audioTransceiver.sender

        createDataChannels(connection)
    }

    private fun createDataChannels(connection: PeerConnection) {
        // Same configs as lib/webrtc/index.ts's _webrtcDataChannelsConfig.
        val input = connection.createDataChannel(
            CHANNEL_INPUT,
            DataChannel.Init().apply { ordered = true; protocol = "1.0" },
        )
        input.registerObserver(dataChannelObserver(CHANNEL_INPUT, isInput = true))
        inputChannel = input

        val chat = connection.createDataChannel(
            CHANNEL_CHAT,
            DataChannel.Init().apply { protocol = "chatV1" },
        )
        chat.registerObserver(dataChannelObserver(CHANNEL_CHAT, isInput = false))
        jsonChannels[CHANNEL_CHAT] = chat

        val control = connection.createDataChannel(
            CHANNEL_CONTROL,
            DataChannel.Init().apply { protocol = "controlV1" },
        )
        control.registerObserver(dataChannelObserver(CHANNEL_CONTROL, isInput = false))
        jsonChannels[CHANNEL_CONTROL] = control

        val message = connection.createDataChannel(
            CHANNEL_MESSAGE,
            DataChannel.Init().apply { protocol = "messageV1" },
        )
        message.registerObserver(dataChannelObserver(CHANNEL_MESSAGE, isInput = false))
        jsonChannels[CHANNEL_MESSAGE] = message
    }

    private fun dataChannelObserver(name: String, isInput: Boolean) = object : DataChannel.Observer {
        override fun onBufferedAmountChange(previousAmount: Long) {}

        override fun onStateChange() {
            val channel = if (isInput) inputChannel else jsonChannels[name]
            when (channel?.state()) {
                DataChannel.State.OPEN -> onChannelOpen(name)
                DataChannel.State.CLOSED -> onChannelClose(name)
                else -> {}
            }
        }

        override fun onMessage(buffer: DataChannel.Buffer) {
            val bytes = ByteArray(buffer.data.remaining())
            buffer.data.get(bytes)
            if (isInput) {
                onInputChannelMessage(bytes)
            } else {
                onChannelMessage(name, String(bytes, Charsets.UTF_8))
            }
        }
    }

    // ---- offer/answer + ICE, driven by XcloudWebRtcModule on JS's behalf ----

    fun createOffer(callback: (SessionDescription?, String?) -> Unit) {
        val connection = pc
        if (connection == null) {
            callback(null, "not initialized")
            return
        }
        connection.createOffer(
            object : SdpObserver by NoopSdpObserver {
                override fun onCreateSuccess(offer: SessionDescription) {
                    connection.setLocalDescription(
                        object : SdpObserver by NoopSdpObserver {
                            override fun onSetSuccess() {
                                callback(offer, null)
                            }

                            override fun onSetFailure(error: String?) {
                                callback(null, "setLocalDescription failed: $error")
                            }
                        },
                        offer,
                    )
                }

                override fun onCreateFailure(error: String?) {
                    callback(null, "createOffer failed: $error")
                }
            },
            MediaConstraints(),
        )
    }

    fun setRemoteOffer(sdp: String, callback: (String?) -> Unit) {
        val connection = pc
        if (connection == null) {
            callback("not initialized")
            return
        }
        connection.setRemoteDescription(
            object : SdpObserver by NoopSdpObserver {
                override fun onSetSuccess() {
                    callback(null)
                }

                override fun onSetFailure(error: String?) {
                    callback("setRemoteDescription failed: $error")
                }
            },
            SessionDescription(SessionDescription.Type.ANSWER, sdp),
        )
    }

    fun getIceCandidates(): List<IceCandidate> = localIceCandidates.toList()

    // Mirrors the TS webRTCClient#setIceCandidates filtering exactly: skip
    // the end-of-candidates marker, and skip any candidate claiming UDP
    // that also carries a tcptype attribute (a malformed/invalid candidate
    // the TS version works around the same way).
    fun addRemoteIceCandidates(candidates: List<XcloudIceCandidateInfo>) {
        val connection = pc ?: return
        for (c in candidates) {
            if (c.candidate == "a=end-of-candidates") {
                continue
            }
            if (c.candidate.contains("UDP") && c.candidate.contains("tcptype")) {
                continue
            }
            try {
                connection.addIceCandidate(IceCandidate(c.sdpMid, c.sdpMLineIndex ?: 0, c.candidate))
            } catch (e: Exception) {
            }
        }
    }

    // ---- mic (chat channel's voice, triggers a renegotiation like the TS
    // version's Chat.ts#startMic -> _client.sdpNegotiationChat()) ----

    fun startMic(): Boolean {
        val sender = audioSender ?: return false
        if (disposed) {
            return false
        }
        if (micTrack != null) {
            micTrack?.setEnabled(true)
            renegotiate()
            return true
        }
        try {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                optional.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "false"))
                optional.add(MediaConstraints.KeyValuePair("googAutoGainControl", "false"))
            }
            val source = factory.createAudioSource(constraints)
            val track = factory.createAudioTrack("xcloud_mic", source)
            track.setEnabled(true)
            sender.setTrack(track, false)
            micSource = source
            micTrack = track
            renegotiate()
            return true
        } catch (e: Exception) {
            return false
        }
    }

    fun stopMic() {
        val track = micTrack
        val source = micSource
        micTrack = null
        micSource = null
        try {
            audioSender?.setTrack(null, false)
        } catch (e: Exception) {
        }
        try {
            track?.dispose()
        } catch (e: Exception) {
        }
        try {
            source?.dispose()
        } catch (e: Exception) {
        }
        renegotiate()
    }

    // createOffer().then(offer => this._sdpHandler(this, offer)), same as
    // webRTCClient#sdpNegotiationChat -- the resulting offer SDP goes to JS,
    // which does the REST round trip (sendChatSdp) and calls setRemoteOffer
    // back, exactly like the TS version's flow.
    private fun renegotiate() {
        createOffer { offer, error ->
            if (offer != null) {
                onRenegotiationOffer(offer.description)
            } else if (error != null) {
                onState("failed", "mic renegotiation failed: $error")
            }
        }
    }

    // ---- input channel (binary, fully native hot path) ----

    fun setPollRate(hz: Double) {
        pollRateHz = if (hz > 0) hz else 62.5
    }

    fun setMaxTouchPoints(value: Int) {
        maxTouchPoints = value.coerceIn(0, 255)
    }

    fun getMaxTouchPoints(): Int = maxTouchPoints

    fun setGamepadState(frames: List<XcloudGamepadFrame>) {
        gamepadFrames = frames
    }

    fun queuePointerInput(events: List<XcloudPointerEvent>) {
        if (events.isEmpty()) {
            return
        }
        pointerQueue.add(events)
    }

    fun addProcessedFrame(frame: XcloudMetadataFrame) {
        metadataQueue.add(frame)
    }

    // Called once the message channel's handshake is acked -- matches
    // Channel/Input.ts#start(): send the one-shot ClientMetadata packet,
    // then start the poll-rate-driven resend loop (the TS version runs this
    // as two separate loops -- InputChannel's own flush interval and
    // GamepadDriver's resend loop -- collapsed here into one).
    fun startInput() {
        val packet = XcloudInputPacket(inputSequence)
        packet.setMetadata(maxTouchPoints)
        sendRaw(inputChannel, packet.toBuffer())

        inputLoop?.shutdownNow()
        val executor = Executors.newSingleThreadScheduledExecutor()
        inputLoop = executor
        val periodMs = (1000.0 / pollRateHz).toLong().coerceAtLeast(1)
        executor.scheduleWithFixedDelay(
            { flushInput() },
            periodMs,
            periodMs,
            TimeUnit.MILLISECONDS,
        )
    }

    fun stopInput() {
        inputLoop?.shutdownNow()
        inputLoop = null
    }

    private fun flushInput() {
        if (disposed) {
            return
        }
        val metadata = drain(metadataQueue, 29)
        val pointers = drain(pointerQueue, 29)
        val gamepad = gamepadFrames
        if (metadata.isEmpty() && pointers.isEmpty() && gamepad.isEmpty()) {
            return
        }
        inputSequence++
        val packet = XcloudInputPacket(inputSequence)
        packet.setData(metadata, gamepad, pointers, serverWidth, serverHeight)
        if (!packet.isEmpty()) {
            sendRaw(inputChannel, packet.toBuffer())
        }
    }

    private fun <T> drain(queue: MutableList<T>, maxCount: Int): List<T> {
        synchronized(queue) {
            if (queue.isEmpty()) {
                return emptyList()
            }
            val n = minOf(maxCount, queue.size)
            val taken = ArrayList<T>(n)
            repeat(n) { taken.add(queue.removeAt(0)) }
            return taken
        }
    }

    private fun onInputChannelMessage(bytes: ByteArray) {
        val incoming = try {
            parseInputChannelMessage(bytes)
        } catch (e: Exception) {
            return
        }
        incoming.serverWidth?.let { serverWidth = it }
        incoming.serverHeight?.let { serverHeight = it }
        incoming.rumble?.let { onRumble(it) }
    }

    // ---- generic channel I/O for the JSON control/chat/message channels,
    // reused unchanged from Control.ts/Message.ts on the JS side ----

    fun sendOnChannel(name: String, text: String) {
        sendRaw(jsonChannels[name], text.toByteArray(Charsets.UTF_8))
    }

    fun isChannelOpen(name: String): Boolean =
        (if (name == CHANNEL_INPUT) inputChannel else jsonChannels[name])?.state() == DataChannel.State.OPEN

    private fun sendRaw(channel: DataChannel?, bytes: ByteArray) {
        if (channel?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            channel.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), true))
        } catch (e: Exception) {
        }
    }

    fun getStats(callback: (org.webrtc.RTCStatsReport?) -> Unit) {
        val connection = pc
        if (connection == null) {
            callback(null)
            return
        }
        connection.getStats { report -> callback(report) }
    }

    fun close() {
        dispose()
    }

    fun dispose() {
        disposed = true
        stopInput()
        try {
            micTrack?.dispose()
        } catch (e: Exception) {
        }
        try {
            micSource?.dispose()
        } catch (e: Exception) {
        }
        micTrack = null
        micSource = null
        try {
            inputChannel?.close()
        } catch (e: Exception) {
        }
        jsonChannels.values.forEach {
            try {
                it.close()
            } catch (e: Exception) {
            }
        }
        jsonChannels.clear()
        try {
            pc?.close()
        } catch (e: Exception) {
        }
        pc = null
    }
}

data class XcloudIceCandidateInfo(val candidate: String, val sdpMid: String?, val sdpMLineIndex: Int?)
