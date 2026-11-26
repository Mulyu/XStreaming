package com.xstreaming.gfn

import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * GeForce NOW WebRTC streaming client -- a Kotlin port of
 * features/gfn-session/lib/webrtcClient.ts for org.webrtc directly (no
 * react-native-webrtc / RN bridge in this class at all). Given a ready
 * CloudMatch session (still resolved in JS -- session.ts's own CloudMatch
 * REST polling is a separate concern from the WebRTC layer and is not
 * ported here), it connects the nvst signaling socket, answers the server's
 * WebRTC offer (with the nvstSdp blob), trickles ICE, surfaces the remote
 * video/audio tracks, and -- once the input handshake arrives -- sends
 * gamepad/mouse/keyboard state over the input data channels.
 *
 * Not yet carried over from the TS version: the 3-tier escalating "no offer
 * yet" watchdog (collapsed here to one 15s check) and wiring the remote
 * VideoTrack into a renderer (RTCFsrVideoView) -- the latter is a separate,
 * deliberately-not-yet-made decision about how a native view attaches to a
 * track created outside react-native-webrtc's own registry; onTrack below
 * still reports the track so that wiring can be added without touching this
 * class again.
 */

data class GfnIceServerInfo(val urls: List<String>, val username: String? = null, val credential: String? = null)

data class GfnStreamSettingsInfo(
    val resolution: String,
    val fps: Int,
    val maxBitrateMbps: Double,
    val codec: String, // "H264" | "H265" | "AV1"
)

data class GfnSessionInfo(
    val sessionId: String,
    val signalingUrl: String,
    val iceServers: List<GfnIceServerInfo>,
    val settings: GfnStreamSettingsInfo,
)

enum class GfnConnectionState {
    CONNECTING,
    SIGNALING,
    NEGOTIATING,
    CONNECTED,
    DISCONNECTED,
    FAILED,
}

private const val DEFAULT_PARTIAL_RELIABLE_MS = 30
private const val OFFER_WAIT_MS = 15_000L
// Connected + XInput-style bitmap for controller 0 (bit 0 | bit 8).
private const val CONTROLLER0_BITMAP = 0x0101

private fun parseResolution(input: String): Pair<Int, Int> {
    val parts = input.split("x")
    val width = parts.getOrNull(0)?.toIntOrNull()
    val height = parts.getOrNull(1)?.toIntOrNull()
    if (width == null || height == null || width <= 0 || height <= 0) {
        return 1920 to 1080
    }
    return width to height
}

// SdpObserver has four callbacks; most call sites only care about one of
// them. Delegate the rest to this no-op so each use site reads like the
// corresponding single `await` in the TS version.
private object NoopSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}

class GfnWebRtcClient(
    private val session: GfnSessionInfo,
    private val factory: PeerConnectionFactory,
    private val onTrack: (VideoTrack?, AudioTrack?) -> Unit = { _, _ -> },
    private val onState: (GfnConnectionState, String?) -> Unit = { _, _ -> },
) {
    private var pc: PeerConnection? = null
    private val signaling = GfnSignalingClient(session.signalingUrl, session.sessionId)
    private var reliableInput: DataChannel? = null
    private var partiallyReliableInput: DataChannel? = null
    private val encoder = GfnInputEncoder()
    @Volatile private var inputReady = false
    private var answerSent = false
    @Volatile private var disposed = false
    private var partialReliableThresholdMs = DEFAULT_PARTIAL_RELIABLE_MS
    private val queuedLocalIce = mutableListOf<GfnIceCandidate>()
    private val queuedRemoteIce = mutableListOf<GfnIceCandidate>()

    // Transceiver the server offered for receiving our microphone, if any.
    private var micTransceiver: RtpTransceiver? = null
    private var micSource: AudioSource? = null
    private var micTrack: AudioTrack? = null

    private var heartbeat: ScheduledExecutorService? = null
    private var offerWatchdog: ScheduledExecutorService? = null

    private fun setState(state: GfnConnectionState, detail: String? = null) {
        onState(state, detail)
    }

    fun connect() {
        setState(GfnConnectionState.SIGNALING)
        signaling.onEvent { event -> handleSignalingEvent(event) }
        signaling.connect()
    }

    private fun handleSignalingEvent(event: GfnSignalingEvent) {
        if (disposed) {
            return
        }
        when (event) {
            is GfnSignalingEvent.Connected -> {
                setState(GfnConnectionState.SIGNALING, "signaling connected")
                armOfferWatchdog()
            }
            is GfnSignalingEvent.Offer -> {
                clearOfferWatchdog()
                try {
                    handleOffer(event.sdp)
                } catch (e: Exception) {
                    setState(GfnConnectionState.FAILED, "offer handling failed: ${e.message}")
                }
            }
            is GfnSignalingEvent.RemoteIce -> addRemoteCandidate(event.candidate)
            is GfnSignalingEvent.Disconnected -> setState(GfnConnectionState.DISCONNECTED, event.reason)
            is GfnSignalingEvent.Error -> setState(GfnConnectionState.FAILED, event.message)
        }
    }

    // The server sends the offer right after sign-in. If nothing arrives,
    // say so -- collapsed from the TS version's 3-tier escalating watchdog
    // (which also dumped the session's own diagnostics strings, not carried
    // over here) to a single check.
    private fun armOfferWatchdog() {
        clearOfferWatchdog()
        val executor = Executors.newSingleThreadScheduledExecutor()
        offerWatchdog = executor
        executor.schedule(
            {
                if (!disposed && pc == null) {
                    setState(GfnConnectionState.SIGNALING, "no offer after ${OFFER_WAIT_MS / 1000}s")
                }
            },
            OFFER_WAIT_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun clearOfferWatchdog() {
        offerWatchdog?.shutdownNow()
        offerWatchdog = null
    }

    private fun handleOffer(offerSdp: String) {
        setState(GfnConnectionState.NEGOTIATING)
        Regex("a=ri\\.partialReliableThresholdMs:(\\d+)").find(offerSdp)?.let {
            partialReliableThresholdMs = it.groupValues[1].toIntOrNull() ?: partialReliableThresholdMs
        }

        val iceServers = session.iceServers.map { s ->
            PeerConnection.IceServer.builder(s.urls)
                .setUsername(s.username ?: "")
                .setPassword(s.credential ?: "")
                .createIceServer()
        }
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                val c = GfnIceCandidate(candidate.sdp, candidate.sdpMid, candidate.sdpMLineIndex, null)
                if (!answerSent) {
                    queuedLocalIce.add(c)
                } else {
                    signaling.sendIceCandidate(c)
                }
            }

            override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<out MediaStream>) {
                when (val track = receiver.track()) {
                    is VideoTrack -> onTrack(track, null)
                    is AudioTrack -> onTrack(null, track)
                    else -> {}
                }
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> setState(GfnConnectionState.CONNECTED)
                    PeerConnection.PeerConnectionState.FAILED -> setState(GfnConnectionState.FAILED, "peer connection failed")
                    PeerConnection.PeerConnectionState.DISCONNECTED -> setState(GfnConnectionState.DISCONNECTED, "peer disconnected")
                    else -> {}
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
            setState(GfnConnectionState.FAILED, "createPeerConnection returned null")
            return
        }
        pc = connection

        createDataChannels(connection)

        connection.setRemoteDescription(
            object : SdpObserver by NoopSdpObserver {
                override fun onSetSuccess() {
                    prepareMicTransceiver(connection, offerSdp)
                    answerOffer(connection)
                }

                override fun onSetFailure(error: String?) {
                    setState(GfnConnectionState.FAILED, "setRemoteDescription failed: $error")
                }
            },
            SessionDescription(SessionDescription.Type.OFFER, offerSdp),
        )
    }

    // Match the encoder settings this session was actually requested with
    // (CloudMatch was told the same resolution/fps/bitrate/codec) rather than
    // an independent, possibly-stale hardcoded copy.
    private fun answerOffer(connection: PeerConnection) {
        val maxBitrateKbps = Math.round(session.settings.maxBitrateMbps * 1000).toInt()
        connection.createAnswer(
            object : SdpObserver by NoopSdpObserver {
                override fun onCreateSuccess(answer: SessionDescription) {
                    // createAnswer() has no codec preference of its own -- force
                    // the codec actually asked for so negotiation can't land on
                    // one that needs a slow software decode path under load.
                    var sdp = preferVideoCodec(answer.description, session.settings.codec)
                    // Match the official web client: "b=AS:<kbps>" + "stereo=1".
                    sdp = mungeAnswerSdp(sdp, maxBitrateKbps)
                    val finalDescription = SessionDescription(SessionDescription.Type.ANSWER, sdp)
                    connection.setLocalDescription(
                        object : SdpObserver by NoopSdpObserver {
                            override fun onSetSuccess() {
                                finishAnswer(connection, sdp, maxBitrateKbps)
                            }

                            override fun onSetFailure(error: String?) {
                                setState(GfnConnectionState.FAILED, "setLocalDescription failed: $error")
                            }
                        },
                        finalDescription,
                    )
                }

                override fun onCreateFailure(error: String?) {
                    setState(GfnConnectionState.FAILED, "createAnswer failed: $error")
                }
            },
            MediaConstraints(),
        )
    }

    private fun finishAnswer(connection: PeerConnection, fallbackSdp: String, maxBitrateKbps: Int) {
        val finalSdp = connection.localDescription?.description ?: fallbackSdp
        val credentials = extractIceCredentials(finalSdp)
        val (width, height) = parseResolution(session.settings.resolution)
        val nvstSdp = buildNvstSdp(
            NvstParams(
                width = width,
                height = height,
                fps = session.settings.fps,
                maxBitrateKbps = maxBitrateKbps,
                partialReliableThresholdMs = partialReliableThresholdMs,
                codec = session.settings.codec,
                credentials = credentials,
            ),
        )

        signaling.sendAnswer(GfnAnswer(finalSdp, nvstSdp))
        answerSent = true

        // Flush candidates queued in both directions.
        val localQueued = queuedLocalIce.toList()
        queuedLocalIce.clear()
        localQueued.forEach { signaling.sendIceCandidate(it) }

        val remoteQueued = queuedRemoteIce.toList()
        queuedRemoteIce.clear()
        remoteQueued.forEach { addRemoteCandidateNow(it) }
    }

    // Locate the audio line the server offers for our microphone and make
    // the answer send on it (recvonly -> sendonly). Done between
    // setRemoteDescription and createAnswer, like the official client, so no
    // renegotiation is needed.
    private fun prepareMicTransceiver(connection: PeerConnection, offerSdp: String) {
        val media = parseSdpMedia(offerSdp)
        val section = findMicSection(media) ?: return
        val transceivers = connection.transceivers
        val transceiver = transceivers.firstOrNull { section.mid != null && it.mid == section.mid }
            ?: transceivers.getOrNull(section.index)
            ?: return
        try {
            transceiver.direction = if (section.direction == SdpDirection.INACTIVE) {
                RtpTransceiver.RtpTransceiverDirection.SEND_ONLY
            } else {
                RtpTransceiver.RtpTransceiverDirection.SEND_RECV
            }
            micTransceiver = transceiver
        } catch (e: Exception) {
            // Matches the TS version's own best-effort catch.
        }
    }

    // True when the server offered a microphone line this session.
    val micAvailable: Boolean
        get() = micTransceiver != null

    // True while a microphone track is attached and sending.
    val micSending: Boolean
        get() = micTrack != null

    // Start sending the microphone. Returns false (never throws) when the
    // server offered no mic line or capture fails. Unlike the TS version,
    // there is no getUserMedia() permission prompt here -- RECORD_AUDIO must
    // already be granted by the time this is called.
    fun startMic(): Boolean {
        val sender = micTransceiver?.sender ?: return false
        if (disposed) {
            return false
        }
        if (micTrack != null) {
            micTrack?.setEnabled(true)
            return true
        }
        try {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                optional.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "false"))
                optional.add(MediaConstraints.KeyValuePair("googAutoGainControl", "false"))
            }
            val source = factory.createAudioSource(constraints)
            val track = factory.createAudioTrack("gfn_mic", source)
            track.setEnabled(true)
            sender.setTrack(track, false)
            micSource = source
            micTrack = track
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
            micTransceiver?.sender?.setTrack(null, false)
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
    }

    private fun createDataChannels(connection: PeerConnection) {
        // Stats channel (server -> client): unreliable. Not retained -- the TS
        // version never reads from it either, only opens it because the
        // server's own m-line count expects it.
        connection.createDataChannel("stats_channel", DataChannel.Init().apply { ordered = false; maxRetransmits = 0 })

        // Reliable input channel -- the server's input handshake arrives here.
        val reliable = connection.createDataChannel("input_channel_v1", DataChannel.Init().apply { ordered = true })
        reliable.registerObserver(
            object : DataChannel.Observer {
                override fun onBufferedAmountChange(previousAmount: Long) {}
                override fun onStateChange() {}
                override fun onMessage(buffer: DataChannel.Buffer) {
                    val bytes = ByteArray(buffer.data.remaining())
                    buffer.data.get(bytes)
                    onInputChannelMessage(bytes)
                }
            },
        )
        reliableInput = reliable

        // Partially reliable input channel -- lower latency for gamepad.
        val pr = connection.createDataChannel(
            "input_channel_partially_reliable",
            DataChannel.Init().apply { ordered = false; maxPacketLifeTime = partialReliableThresholdMs },
        )
        partiallyReliableInput = pr
    }

    private fun onInputChannelMessage(bytes: ByteArray) {
        if (inputReady) {
            // Post-handshake messages are haptics; ignored for now.
            return
        }
        val version = parseInputHandshake(bytes) ?: return
        GfnInputClock.start()
        encoder.setProtocolVersion(version)
        inputReady = true
        startInputHeartbeat()
    }

    private fun startInputHeartbeat() {
        stopInputHeartbeat()
        val executor = Executors.newSingleThreadScheduledExecutor()
        heartbeat = executor
        executor.scheduleWithFixedDelay(
            {
                if (reliableInput?.state() == DataChannel.State.OPEN) {
                    try {
                        sendOnChannel(reliableInput, encoder.encodeHeartbeat())
                    } catch (e: Exception) {
                    }
                }
            },
            1,
            1,
            TimeUnit.SECONDS,
        )
    }

    private fun stopInputHeartbeat() {
        heartbeat?.shutdownNow()
        heartbeat = null
    }

    private fun sendOnChannel(channel: DataChannel?, bytes: ByteArray) {
        channel?.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), true))
    }

    // Send a controller state snapshot. Safe to call before input is ready (no-op).
    fun sendGamepad(input: GamepadInput) {
        if (!inputReady) {
            return
        }
        val usePr = partiallyReliableInput?.state() == DataChannel.State.OPEN
        val channel = if (usePr) partiallyReliableInput else reliableInput
        if (channel?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(channel, encoder.encodeGamepadState(input, CONTROLLER0_BITMAP, usePr))
        } catch (e: Exception) {
        }
    }

    // Mouse move (relative delta, in pixels). Prefers the partially-reliable
    // channel like gamepad state -- a dropped move is imperceptible, unlike a
    // dropped click, so it doesn't need the reliable channel's guarantees.
    fun sendMouseMove(dx: Int, dy: Int) {
        if (!inputReady) {
            return
        }
        val usePr = partiallyReliableInput?.state() == DataChannel.State.OPEN
        val channel = if (usePr) partiallyReliableInput else reliableInput
        if (channel?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(channel, encoder.encodeMouseMove(dx, dy))
        } catch (e: Exception) {
        }
    }

    // Absolute pointer position (touch tap/drag emulation). x/y are
    // normalized 0..1 within the video viewport.
    fun sendMouseAbsolute(normalizedX: Float, normalizedY: Float, reliable: Boolean = false) {
        if (!inputReady) {
            return
        }
        val usePr = !reliable && partiallyReliableInput?.state() == DataChannel.State.OPEN
        val channel = if (usePr) partiallyReliableInput else reliableInput
        if (channel?.state() != DataChannel.State.OPEN) {
            return
        }
        val extent = 65535
        val x = (normalizedX * extent).let { Math.round(it) }.coerceIn(0, extent)
        val y = (normalizedY * extent).let { Math.round(it) }.coerceIn(0, extent)
        try {
            sendOnChannel(channel, encoder.encodeMouseAbsolute(x, y, extent, extent))
        } catch (e: Exception) {
        }
    }

    // Mouse buttons and wheel always go over the reliable channel -- unlike
    // move deltas, dropping one of these leaves a button stuck down or a
    // click that never registers.
    fun sendMouseButtonDown(button: Int) {
        if (!inputReady || reliableInput?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(reliableInput, encoder.encodeMouseButtonDown(button))
        } catch (e: Exception) {
        }
    }

    fun sendMouseButtonUp(button: Int) {
        if (!inputReady || reliableInput?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(reliableInput, encoder.encodeMouseButtonUp(button))
        } catch (e: Exception) {
        }
    }

    fun sendMouseWheel(delta: Int, horizontal: Int = 0) {
        if (!inputReady || reliableInput?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(reliableInput, encoder.encodeMouseWheel(delta, horizontal))
        } catch (e: Exception) {
        }
    }

    // Keyboard, like mouse buttons, always goes over the reliable channel.
    fun sendKeyDown(virtualKey: Int, modifiers: Int) {
        if (!inputReady || reliableInput?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(reliableInput, encoder.encodeKeyDown(virtualKey, modifiers))
        } catch (e: Exception) {
        }
    }

    fun sendKeyUp(virtualKey: Int, modifiers: Int) {
        if (!inputReady || reliableInput?.state() != DataChannel.State.OPEN) {
            return
        }
        try {
            sendOnChannel(reliableInput, encoder.encodeKeyUp(virtualKey, modifiers))
        } catch (e: Exception) {
        }
    }

    private fun addRemoteCandidate(candidate: GfnIceCandidate) {
        val connection = pc
        if (connection == null || connection.remoteDescription == null) {
            queuedRemoteIce.add(candidate)
            return
        }
        addRemoteCandidateNow(candidate)
    }

    private fun addRemoteCandidateNow(candidate: GfnIceCandidate) {
        val connection = pc ?: return
        try {
            connection.addIceCandidate(
                IceCandidate(candidate.sdpMid, candidate.sdpMLineIndex ?: 0, candidate.candidate),
            )
        } catch (e: Exception) {
        }
    }

    // Expose the peer connection's WebRTC stats for the performance overlay.
    // Calls back with null before the connection exists.
    fun getStats(callback: (org.webrtc.RTCStatsReport?) -> Unit) {
        val connection = pc
        if (connection == null) {
            callback(null)
            return
        }
        connection.getStats { report -> callback(report) }
    }

    fun dispose() {
        disposed = true
        clearOfferWatchdog()
        stopMic()
        micTransceiver = null
        stopInputHeartbeat()
        signaling.disconnect()
        try {
            reliableInput?.close()
        } catch (e: Exception) {
        }
        try {
            partiallyReliableInput?.close()
        } catch (e: Exception) {
        }
        try {
            pc?.close()
        } catch (e: Exception) {
        }
        pc = null
    }
}
