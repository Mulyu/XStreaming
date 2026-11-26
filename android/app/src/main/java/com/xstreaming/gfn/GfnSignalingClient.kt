package com.xstreaming.gfn

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/**
 * GeForce NOW "nvst" signaling client -- a Kotlin port of
 * features/gfn-session/lib/signaling.ts for OkHttp's WebSocket (already on
 * the app's classpath transitively via com.facebook.react:react-android,
 * which pulls in com.squareup.okhttp3:okhttp as an api dependency -- no new
 * Gradle dependency needed). Connects to the session's signaling WebSocket,
 * performs the peer sign-in handshake, and relays the server's WebRTC OFFER +
 * trickled ICE candidates to the WebRTC client, sending our ANSWER (+
 * nvstSdp) and local ICE back. The client is peer_role=1; the game server is
 * the offerer. Ported from OpenNOW (MIT) by way of the React Native version.
 *
 * Listener callbacks (onEvent) arrive on OkHttp's own dispatcher thread, not
 * the caller's thread -- the same as the JS version's WebSocket callbacks
 * arriving on RN's own bridge thread, not necessarily the JS thread that
 * called connect().
 */

private const val GFN_PLAY_ORIGIN = "https://play.geforcenow.com"
private const val GFN_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173"

data class GfnIceCandidate(
    val candidate: String,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
    val usernameFragment: String? = null,
)

sealed class GfnSignalingEvent {
    object Connected : GfnSignalingEvent()
    data class Offer(val sdp: String) : GfnSignalingEvent()
    data class RemoteIce(val candidate: GfnIceCandidate) : GfnSignalingEvent()
    data class Disconnected(val reason: String) : GfnSignalingEvent()
    data class Error(val message: String) : GfnSignalingEvent()
}

data class GfnAnswer(val sdp: String, val nvstSdp: String? = null)

// typeof x === 'number' / 'string' equivalents -- Gson's JsonPrimitive makes
// no such distinction on its own (asInt/asString coerce rather than fail).
private fun JsonElement?.asIntOrNull(): Int? =
    this?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asInt

private fun JsonElement?.asStringOrNull(): String? =
    this?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString

class GfnSignalingClient(
    private val signalingUrl: String,
    private val sessionId: String,
) {
    private var ws: WebSocket? = null
    private var peerId = 0
    private var remotePeerId = 1
    private val peerName = "peer-${Random.nextLong(0L, 10_000_000_000L)}"
    private var ackCounter = 0
    private var heartbeat: ScheduledExecutorService? = null
    private var listener: (GfnSignalingEvent) -> Unit = {}
    private var rxHeartbeats = 0
    private val rxOther = mutableListOf<String>()

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            // GFN's own JSON {hb:1} heartbeat (below) keeps the connection alive;
            // no need for OkHttp's own ping frames too.
            .pingInterval(0, TimeUnit.SECONDS)
            .build()
    }

    fun onEvent(listener: (GfnSignalingEvent) -> Unit) {
        this.listener = listener
    }

    private fun emit(event: GfnSignalingEvent) {
        listener(event)
    }

    // What the server has sent so far, for the stall screen: heartbeat count
    // and the first few other frames (shape, then the start of the raw text).
    fun describeReceived(): String {
        val otherPart = if (rxOther.isNotEmpty()) " " + rxOther.joinToString(" ; ") else ""
        return "rx: hb=$rxHeartbeats other=${rxOther.size}$otherPart"
    }

    private fun noteReceived(parsed: JsonObject, text: String) {
        if (parsed.has("hb")) {
            rxHeartbeats += 1
            return
        }
        if (rxOther.size < 3) {
            rxOther.add(text.take(90))
        }
    }

    private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun buildSignInUrl(): String {
        val base = if (signalingUrl.endsWith("/")) signalingUrl else "$signalingUrl/"
        val url = if (base.startsWith("wss://")) base else "wss://$base"
        val params = listOf(
            "peer_id" to peerName,
            "version" to "2",
            "peer_role" to "1",
            "pairing_id" to sessionId,
        ).joinToString("&") { (k, v) -> "${urlEncode(k)}=${urlEncode(v)}" }
        return "${url}sign_in?$params"
    }

    private fun nextAckId(): Int {
        ackCounter += 1
        return ackCounter
    }

    private fun sendJson(payload: JsonObject) {
        ws?.send(payload.toString())
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        val executor = Executors.newSingleThreadScheduledExecutor()
        heartbeat = executor
        executor.scheduleWithFixedDelay(
            { sendJson(JsonObject().apply { addProperty("hb", 1) }) },
            5,
            5,
            TimeUnit.SECONDS,
        )
    }

    private fun stopHeartbeat() {
        heartbeat?.shutdownNow()
        heartbeat = null
    }

    private fun sendPeerInfo() {
        val peerInfo = JsonObject().apply {
            addProperty("browser", "Chrome")
            addProperty("browserVersion", "131")
            addProperty("connected", true)
            addProperty("id", peerId)
            addProperty("name", peerName)
            addProperty("peerRole", 0)
            addProperty("resolution", "1920x1080")
            addProperty("version", 2)
        }
        sendJson(
            JsonObject().apply {
                addProperty("ackid", nextAckId())
                add("peer_info", peerInfo)
            },
        )
    }

    fun connect() {
        val url = buildSignInUrl()
        val host = url.replace(Regex("^wss?://"), "").split("/")[0]
        val protocol = "x-nv-sessionid.$sessionId"
        val request = Request.Builder()
            .url(url)
            .addHeader("Origin", GFN_PLAY_ORIGIN)
            .addHeader("User-Agent", GFN_USER_AGENT)
            .addHeader("Sec-WebSocket-Protocol", protocol)
            .build()

        val socket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    sendPeerInfo()
                    startHeartbeat()
                    emit(GfnSignalingEvent.Connected)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(text)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    stopHeartbeat()
                    if (ws === webSocket) {
                        ws = null
                        emit(GfnSignalingEvent.Disconnected(reason.ifEmpty { "socket closed" }))
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    stopHeartbeat()
                    emit(GfnSignalingEvent.Error("Signaling error @ $host: ${t.message ?: "unknown"}"))
                    if (ws === webSocket) {
                        ws = null
                    }
                }
            },
        )
        ws = socket
    }

    private fun handleMessage(text: String) {
        val parsed = try {
            JsonParser.parseString(text).asJsonObject
        } catch (e: Exception) {
            return
        }
        noteReceived(parsed, text)

        val peerInfo = parsed.getAsJsonObject("peer_info")
        if (peerInfo != null) {
            val id = peerInfo.get("id").asIntOrNull()
            val name = peerInfo.get("name").asStringOrNull()
            if (id != null && name == peerName) {
                peerId = id
            }
        }

        val ackId = parsed.get("ackid").asIntOrNull()
        val peerInfoId = peerInfo?.get("id").asIntOrNull()
        if (ackId != null && peerInfoId != peerId) {
            sendJson(JsonObject().apply { addProperty("ack", ackId) })
        }

        if (parsed.has("hb")) {
            sendJson(JsonObject().apply { addProperty("hb", 1) })
            return
        }

        val errorValue = parsed.get("error")
        if (errorValue != null && !errorValue.isJsonNull) {
            val errorText = errorValue.asStringOrNull() ?: errorValue.toString()
            if (errorText == "peerRemoved") {
                emit(GfnSignalingEvent.Disconnected("peerRemoved"))
            } else {
                emit(GfnSignalingEvent.Error("Signaling rejected: $errorText"))
            }
            return
        }

        val peerMsg = parsed.getAsJsonObject("peer_msg") ?: return
        val msg = peerMsg.get("msg").asStringOrNull() ?: return
        val from = peerMsg.get("from").asIntOrNull()
        if (from != null) {
            remotePeerId = from
        }

        val trimmed = msg.trim()
        if (trimmed == "BYE") {
            emit(GfnSignalingEvent.Disconnected("BYE"))
            return
        }

        val payload = try {
            JsonParser.parseString(trimmed).asJsonObject
        } catch (e: Exception) {
            return
        }

        val type = payload.get("type").asStringOrNull()
        val sdp = payload.get("sdp").asStringOrNull()
        if (type == "offer" && sdp != null) {
            emit(GfnSignalingEvent.Offer(sdp))
            return
        }
        val candidate = payload.get("candidate").asStringOrNull()
        if (candidate != null) {
            emit(
                GfnSignalingEvent.RemoteIce(
                    GfnIceCandidate(
                        candidate = candidate,
                        sdpMid = payload.get("sdpMid").asStringOrNull(),
                        sdpMLineIndex = payload.get("sdpMLineIndex").asIntOrNull() ?: 0,
                        usernameFragment = payload.get("usernameFragment").asStringOrNull(),
                    ),
                ),
            )
        }
    }

    fun sendAnswer(answer: GfnAnswer) {
        val msg = JsonObject().apply {
            addProperty("type", "answer")
            addProperty("sdp", answer.sdp)
            if (answer.nvstSdp != null) {
                addProperty("nvstSdp", answer.nvstSdp)
            }
        }
        val peerMsg = JsonObject().apply {
            addProperty("from", peerId)
            addProperty("to", remotePeerId)
            addProperty("msg", msg.toString())
        }
        sendJson(
            JsonObject().apply {
                add("peer_msg", peerMsg)
                addProperty("ackid", nextAckId())
            },
        )
    }

    fun sendIceCandidate(candidate: GfnIceCandidate) {
        // Drop TCP candidates -- GFN media is UDP only.
        val transport = candidate.candidate.trim().split(Regex("\\s+")).getOrNull(2)
        if (transport?.lowercase() == "tcp") {
            return
        }
        val msg = JsonObject().apply {
            addProperty("candidate", candidate.candidate)
            if (candidate.sdpMid != null) addProperty("sdpMid", candidate.sdpMid) else add("sdpMid", com.google.gson.JsonNull.INSTANCE)
            if (candidate.sdpMLineIndex != null) addProperty("sdpMLineIndex", candidate.sdpMLineIndex) else add("sdpMLineIndex", com.google.gson.JsonNull.INSTANCE)
            if (candidate.usernameFragment != null) addProperty("usernameFragment", candidate.usernameFragment) else add("usernameFragment", com.google.gson.JsonNull.INSTANCE)
        }
        val peerMsg = JsonObject().apply {
            addProperty("from", peerId)
            addProperty("to", remotePeerId)
            addProperty("msg", msg.toString())
        }
        sendJson(
            JsonObject().apply {
                add("peer_msg", peerMsg)
                addProperty("ackid", nextAckId())
            },
        )
    }

    fun disconnect() {
        stopHeartbeat()
        ws?.let { socket ->
            ws = null
            try {
                socket.close(1000, null)
            } catch (ignored: Exception) {
            }
        }
    }
}
