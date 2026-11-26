package com.xstreaming.xcloud

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt
import kotlin.math.roundToLong

// Byte-for-byte Kotlin port of
// features/xcloud-session/lib/webrtc/Packet/index.ts's InputPacket, for the
// "input" data channel's binary protocol -- gamepad/pointer/metadata state,
// framed the same way the TS version does so the server-side parser (shared
// with the web/other native xCloud clients) doesn't need to change at all.

private object ReportTypes {
    const val NONE = 0
    const val METADATA = 1
    const val GAMEPAD = 2
    const val POINTER = 4
    const val CLIENT_METADATA = 8
    const val SERVER_METADATA = 16
    const val VIBRATION = 128
}

private object GamepadInputPhysicality {
    const val DPAD_UP = 0x00000001
    const val DPAD_DOWN = 0x00000002
    const val DPAD_LEFT = 0x00000004
    const val DPAD_RIGHT = 0x00000008
    const val MENU = 0x00000010
    const val VIEW = 0x00000020
    const val LEFT_THUMB = 0x00000040
    const val RIGHT_THUMB = 0x00000080
    const val LEFT_SHOULDER = 0x00000100
    const val RIGHT_SHOULDER = 0x00000200
    const val NEXUS = 0x00000400
    const val A = 0x00001000
    const val B = 0x00002000
    const val X = 0x00004000
    const val Y = 0x00008000
    const val LEFT_TRIGGER = 0x00010000
    const val RIGHT_TRIGGER = 0x00020000
    const val LEFT_THUMB_X_AXIS = 0x00040000
    const val LEFT_THUMB_Y_AXIS = 0x00080000
    const val RIGHT_THUMB_X_AXIS = 0x00100000
    const val RIGHT_THUMB_Y_AXIS = 0x00200000
}

private object TouchType {
    const val UNKNOWN = 0
    const val POINTER_DOWN = 1
    const val POINTER_UP = 2
    const val POINTER_MOVE = 3
}

// Mirrors Channel/Input.ts's InputFrame shape exactly (field names there are
// PascalCase on the wire/JS side; this is just the Kotlin-side carrier).
// Button fields are numbers (0/1), not JS booleans -- InputFrame types them
// `number`, and Packet/index.ts itself tests them with `> 0`, not truthiness.
data class XcloudGamepadFrame(
    val gamepadIndex: Int,
    val nexus: Int,
    val menu: Int,
    val view: Int,
    val a: Int,
    val b: Int,
    val x: Int,
    val y: Int,
    val dpadUp: Int,
    val dpadDown: Int,
    val dpadLeft: Int,
    val dpadRight: Int,
    val leftShoulder: Int,
    val rightShoulder: Int,
    val leftThumb: Int,
    val rightThumb: Int,
    val leftThumbXAxis: Double,
    val leftThumbYAxis: Double,
    val rightThumbXAxis: Double,
    val rightThumbYAxis: Double,
    val leftTrigger: Double,
    val rightTrigger: Double,
)

// Mirrors Channel/Input.ts's PointerWireData.
data class XcloudPointerEvent(
    val height: Double,
    val pressure: Double,
    val twist: Double,
    val width: Double,
    val pointerId: Double,
    val x: Double,
    val y: Double,
    val type: String,
    val clientHeight: Double?,
    val clientWidth: Double?,
)

// Mirrors the frame object native-stream/index.tsx's
// createStableResolutionProcessedFrame() builds for addProcessedFrame().
data class XcloudMetadataFrame(
    val serverDataKey: Double,
    val firstFramePacketArrivalTimeMs: Double,
    val frameSubmittedTimeMs: Double,
    val frameDecodedTimeMs: Double,
    val frameRenderedTimeMs: Double,
)

class XcloudInputPacket(private val sequence: Int) {
    private var reportType = ReportTypes.NONE
    private var totalSize = -1
    private var maxTouchpoints = 0

    private var metadataFrames: List<XcloudMetadataFrame> = emptyList()
    private var gamepadFrames: List<XcloudGamepadFrame> = emptyList()
    private var pointerFrames: List<List<XcloudPointerEvent>> = emptyList()
    private var serverWidth = 1920
    private var serverHeight = 1080

    fun setMetadata(maxTouchpoints: Int) {
        reportType = ReportTypes.CLIENT_METADATA
        totalSize = 15
        this.maxTouchpoints = maxTouchpoints
    }

    fun setData(
        metadataQueue: List<XcloudMetadataFrame>,
        gamepadQueue: List<XcloudGamepadFrame>,
        pointerQueue: List<List<XcloudPointerEvent>>,
        serverWidth: Int,
        serverHeight: Int,
    ) {
        var size = 14
        if (metadataQueue.isNotEmpty()) {
            reportType = reportType or ReportTypes.METADATA
            size += 1 + 28 * metadataQueue.size
            metadataFrames = metadataQueue
        }
        if (gamepadQueue.isNotEmpty()) {
            reportType = reportType or ReportTypes.GAMEPAD
            size += 1 + 23 * gamepadQueue.size
            gamepadFrames = gamepadQueue
        }
        if (pointerQueue.isNotEmpty()) {
            reportType = reportType or ReportTypes.POINTER
            var pointerSize = 1
            for (frame in pointerQueue) {
                pointerSize += 1 + 20 * frame.size
            }
            size += pointerSize
            pointerFrames = pointerQueue
        }
        this.serverWidth = if (serverWidth > 0) serverWidth else 1920
        this.serverHeight = if (serverHeight > 0) serverHeight else 1080
        totalSize = size
    }

    fun isEmpty(): Boolean =
        metadataFrames.isEmpty() && gamepadFrames.isEmpty() && pointerFrames.isEmpty()

    fun toBuffer(): ByteArray {
        val buf = ByteBuffer.allocate(totalSize).order(ByteOrder.LITTLE_ENDIAN)
        buf.putShort(reportType.toShort())
        buf.putInt(sequence)
        buf.putDouble(nowMs())

        if (metadataFrames.isNotEmpty()) {
            writeMetadata(buf)
        }
        if (gamepadFrames.isNotEmpty()) {
            writeGamepad(buf)
        }
        if (pointerFrames.isNotEmpty()) {
            writePointer(buf)
        }
        if (reportType == ReportTypes.CLIENT_METADATA) {
            buf.put(maxTouchpoints.toByte())
        }
        return buf.array()
    }

    private fun writeMetadata(buf: ByteBuffer) {
        buf.put(metadataFrames.size.toByte())
        for (frame in metadataFrames) {
            buf.putInt(toUint32Bits(frame.serverDataKey))
            buf.putInt(toUint32Bits(frame.firstFramePacketArrivalTimeMs))
            buf.putInt(toUint32Bits(frame.frameSubmittedTimeMs))
            buf.putInt(toUint32Bits(frame.frameDecodedTimeMs))
            buf.putInt(toUint32Bits(frame.frameRenderedTimeMs))
            // Matches the TS writer's own two independent performance.now()
            // reads at write time (framePacketTime, frameDateNow).
            buf.putInt(toUint32Bits(nowMs()))
            buf.putInt(toUint32Bits(nowMs()))
        }
    }

    private fun writeGamepad(buf: ByteBuffer) {
        buf.put(gamepadFrames.size.toByte())
        for (f in gamepadFrames) {
            buf.put(f.gamepadIndex.toByte())

            var mask = 0
            if (f.nexus > 0) mask = mask or 2
            if (f.menu > 0) mask = mask or 4
            if (f.view > 0) mask = mask or 8
            if (f.a > 0) mask = mask or 16
            if (f.b > 0) mask = mask or 32
            if (f.x > 0) mask = mask or 64
            if (f.y > 0) mask = mask or 128
            if (f.dpadUp > 0) mask = mask or 256
            if (f.dpadDown > 0) mask = mask or 512
            if (f.dpadLeft > 0) mask = mask or 1024
            if (f.dpadRight > 0) mask = mask or 2048
            if (f.leftShoulder > 0) mask = mask or 4096
            if (f.rightShoulder > 0) mask = mask or 8192
            if (f.leftThumb > 0) mask = mask or 16384
            if (f.rightThumb > 0) mask = mask or 32768

            buf.putShort(mask.toShort())
            buf.putShort(normalizeAxisValue(f.leftThumbXAxis).toShort())
            buf.putShort(normalizeAxisValue(-f.leftThumbYAxis).toShort())
            buf.putShort(normalizeAxisValue(f.rightThumbXAxis).toShort())
            buf.putShort(normalizeAxisValue(-f.rightThumbYAxis).toShort())
            buf.putShort(normalizeTriggerValue(f.leftTrigger).toShort())
            buf.putShort(normalizeTriggerValue(f.rightTrigger).toShort())
            buf.putInt(calculatePhysicality(f))
            // VirtualPhysicality -- native-stream never supplies this (xCloud's
            // own web client's "virtual button" tracking isn't ported), same as
            // the TS default when the caller doesn't set it.
            buf.putInt(0)
        }
    }

    private fun writePointer(buf: ByteBuffer) {
        buf.put(pointerFrames.size.toByte())
        for (frame in pointerFrames) {
            buf.put(frame.size.toByte())
            for (ev in frame) {
                writeSinglePointerEvent(buf, ev)
            }
        }
    }

    private fun writeSinglePointerEvent(buf: ByteBuffer, ev: XcloudPointerEvent) {
        val clientWidth = maxOf(1.0, ev.clientWidth ?: 1.0)
        val clientHeight = maxOf(1.0, ev.clientHeight ?: 1.0)
        val normalizedHeight = clampUint16(ev.height * serverHeight / clientHeight)
        val normalizedWidth = clampUint16(ev.width * serverWidth / clientWidth)
        val pressure = clampUint8(ev.pressure * 255.0)
        val twist = clampUint16(ev.twist)
        val pointerId = clampUint32(ev.pointerId)
        val normalizedX = clampUint32(ev.x * serverWidth / clientWidth)
        val normalizedY = clampUint32(ev.y * serverHeight / clientHeight)

        buf.putShort(normalizedHeight.toShort())
        buf.putShort(normalizedWidth.toShort())
        buf.put(pressure.toByte())
        buf.putShort(twist.toShort())
        buf.putInt(pointerId.toInt())
        buf.putInt(normalizedX.toInt())
        buf.putInt(normalizedY.toInt())
        buf.put(mapPointerType(ev.type).toByte())
    }

    private fun mapPointerType(type: String): Int = when (type) {
        "pointerdown" -> TouchType.POINTER_DOWN
        "pointerup" -> TouchType.POINTER_UP
        "pointermove" -> TouchType.POINTER_MOVE
        else -> TouchType.UNKNOWN
    }

    private fun calculatePhysicality(f: XcloudGamepadFrame): Int {
        var p = 0
        if (f.dpadUp > 0) p = p or GamepadInputPhysicality.DPAD_UP
        if (f.dpadDown > 0) p = p or GamepadInputPhysicality.DPAD_DOWN
        if (f.dpadLeft > 0) p = p or GamepadInputPhysicality.DPAD_LEFT
        if (f.dpadRight > 0) p = p or GamepadInputPhysicality.DPAD_RIGHT
        if (f.menu > 0) p = p or GamepadInputPhysicality.MENU
        if (f.view > 0) p = p or GamepadInputPhysicality.VIEW
        if (f.leftThumb > 0) p = p or GamepadInputPhysicality.LEFT_THUMB
        if (f.rightThumb > 0) p = p or GamepadInputPhysicality.RIGHT_THUMB
        if (f.leftShoulder > 0) p = p or GamepadInputPhysicality.LEFT_SHOULDER
        if (f.rightShoulder > 0) p = p or GamepadInputPhysicality.RIGHT_SHOULDER
        if (f.nexus > 0) p = p or GamepadInputPhysicality.NEXUS
        if (f.a > 0) p = p or GamepadInputPhysicality.A
        if (f.b > 0) p = p or GamepadInputPhysicality.B
        if (f.x > 0) p = p or GamepadInputPhysicality.X
        if (f.y > 0) p = p or GamepadInputPhysicality.Y
        if (f.leftTrigger != 0.0) p = p or GamepadInputPhysicality.LEFT_TRIGGER
        if (f.rightTrigger != 0.0) p = p or GamepadInputPhysicality.RIGHT_TRIGGER
        if (Math.hypot(f.leftThumbXAxis, f.leftThumbYAxis) > 0.0) {
            p = p or GamepadInputPhysicality.LEFT_THUMB_X_AXIS
            p = p or GamepadInputPhysicality.LEFT_THUMB_Y_AXIS
        }
        if (Math.hypot(f.rightThumbXAxis, f.rightThumbYAxis) > 0.0) {
            p = p or GamepadInputPhysicality.RIGHT_THUMB_X_AXIS
            p = p or GamepadInputPhysicality.RIGHT_THUMB_Y_AXIS
        }
        return p
    }

    companion object {
        // performance.now()-equivalent: a monotonic millisecond clock. The
        // absolute epoch doesn't matter -- the TS version's own value
        // (ms since page load) is just as arbitrary -- only that it's
        // monotonic and in milliseconds, which is all the wire format and
        // the server's own latency math need.
        private fun nowMs(): Double = System.nanoTime() / 1_000_000.0

        // JS's DataView#setUint32 performs ToUint32 on the given Number:
        // truncate toward zero, then take the value mod 2^32. These frame
        // timestamp/key fields (serverDataKey is Date.now(), ~1.7e12) are
        // well outside uint32 range and get silently wrapped by the TS
        // version today -- replicate the exact same wrapping so the bytes
        // on the wire match, even though the semantics are already lossy
        // upstream.
        private fun toUint32Bits(value: Double): Int {
            if (value.isNaN() || value.isInfinite()) {
                return 0
            }
            return value.toLong().toInt()
        }

        private fun normalizeTriggerValue(e: Double): Int {
            if (e < 0) {
                return 0
            }
            val t = 65535.0 * e
            val a = if (t > 65535.0) 65535.0 else t
            return a.toInt()
        }

        private fun normalizeAxisValue(e: Double): Int {
            val max = 32767.0
            val min = -32767.0
            val n = e * max
            val clamped = if (n > max) max else if (n < min) min else n
            return clamped.toInt()
        }

        private fun clampUint8(value: Double): Int {
            if (!value.isFinite()) return 0
            return value.roundToInt().coerceIn(0, 255)
        }

        private fun clampUint16(value: Double): Int {
            if (!value.isFinite()) return 0
            return value.roundToInt().coerceIn(0, 65535)
        }

        private fun clampUint32(value: Double): Long {
            if (!value.isFinite()) return 0L
            return value.roundToLong().coerceIn(0L, 4294967295L)
        }
    }
}

// Parsed result of Channel/Input.ts#onMessage's ServerMetadata/Vibration
// report bits.
data class XcloudInputIncoming(
    val serverWidth: Int?,
    val serverHeight: Int?,
    val rumble: XcloudRumbleData?,
)

fun parseInputChannelMessage(bytes: ByteArray): XcloudInputIncoming {
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    if (buf.remaining() < 2) {
        return XcloudInputIncoming(null, null, null)
    }
    val reportType = buf.short.toInt() and 0xFFFF
    var serverWidth: Int? = null
    var serverHeight: Int? = null

    if (reportType and ReportTypes.SERVER_METADATA != 0) {
        if (buf.remaining() >= 8) {
            // TS reads height first, then width -- despite the field order
            // the names suggest.
            serverHeight = buf.int
            serverWidth = buf.int
        } else {
            return XcloudInputIncoming(serverWidth, serverHeight, null)
        }
    }

    var rumble: XcloudRumbleData? = null
    if (reportType and ReportTypes.VIBRATION != 0) {
        if (buf.remaining() >= 10) {
            buf.get() // rumbleType (0 = FourMotorRumble) -- unused
            buf.get() // gamepadIndex -- unused
            val leftMotor = (buf.get().toInt() and 0xFF) / 100.0
            val rightMotor = (buf.get().toInt() and 0xFF) / 100.0
            val leftTriggerMotor = (buf.get().toInt() and 0xFF) / 100.0
            val rightTriggerMotor = (buf.get().toInt() and 0xFF) / 100.0
            val durationMs = buf.short.toInt() and 0xFFFF
            val delayMs = buf.short.toInt() and 0xFFFF
            val repeat = buf.get().toInt() and 0xFF
            rumble = XcloudRumbleData(
                startDelay = 0,
                duration = durationMs,
                weakMagnitude = rightMotor,
                strongMagnitude = leftMotor,
                leftTrigger = leftTriggerMotor,
                rightTrigger = rightTriggerMotor,
                delayMs = delayMs,
                repeat = repeat,
            )
        }
    }

    return XcloudInputIncoming(serverWidth, serverHeight, rumble)
}
