package com.xstreaming.gfn

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * GeForce NOW input packet encoding -- a byte-for-byte Kotlin port of
 * entities/gfn-input/model/inputEncoding.ts (itself ported from OpenNOW / the
 * official GFN web client's wire format). Keep the two in sync: this is the
 * JS version's exact byte layout, not a reinterpretation, so the server
 * accepts packets from either client unchanged.
 */

// XInput button flags.
const val GAMEPAD_DPAD_UP = 0x0001
const val GAMEPAD_DPAD_DOWN = 0x0002
const val GAMEPAD_DPAD_LEFT = 0x0004
const val GAMEPAD_DPAD_RIGHT = 0x0008
const val GAMEPAD_START = 0x0010
const val GAMEPAD_BACK = 0x0020
const val GAMEPAD_LS = 0x0040 // Left stick click (L3)
const val GAMEPAD_RS = 0x0080 // Right stick click (R3)
const val GAMEPAD_LB = 0x0100 // Left bumper
const val GAMEPAD_RB = 0x0200 // Right bumper
const val GAMEPAD_GUIDE = 0x0400
const val GAMEPAD_A = 0x1000
const val GAMEPAD_B = 0x2000
const val GAMEPAD_X = 0x4000
const val GAMEPAD_Y = 0x8000

const val GAMEPAD_MAX_CONTROLLERS = 4
const val GAMEPAD_PACKET_SIZE = 38

private const val INPUT_HEARTBEAT = 2
private const val INPUT_KEY_DOWN = 3
private const val INPUT_KEY_UP = 4
private const val INPUT_MOUSE_ABS = 5
private const val INPUT_MOUSE_REL = 7
private const val INPUT_MOUSE_BUTTON_DOWN = 8
private const val INPUT_MOUSE_BUTTON_UP = 9
private const val INPUT_MOUSE_WHEEL = 10
private const val INPUT_GAMEPAD = 12

// Live modifier bitmask sent alongside every key event -- a snapshot of which
// modifiers are currently held, not just for the modifier's own keydown/keyup.
const val KEY_MOD_SHIFT = 0x01
const val KEY_MOD_CTRL = 0x02
const val KEY_MOD_ALT = 0x04
const val KEY_MOD_META = 0x08

// All-controllers mask (bits 0..3).
const val PARTIALLY_RELIABLE_GAMEPAD_MASK_ALL = (1 shl GAMEPAD_MAX_CONTROLLERS) - 1

// Mouse button constants (1-based, matching the GFN protocol).
const val MOUSE_LEFT = 1
const val MOUSE_MIDDLE = 2
const val MOUSE_RIGHT = 3
const val MOUSE_X1 = 4 // "back" side button
const val MOUSE_X2 = 5 // "forward" side button

data class GamepadInput(
    val controllerId: Int, // 0-3
    val buttons: Int, // 16-bit XInput flags
    val leftTrigger: Int, // 0-255
    val rightTrigger: Int, // 0-255
    val leftStickX: Int, // -32768..32767
    val leftStickY: Int, // -32768..32767 (XInput: up is positive)
    val rightStickX: Int,
    val rightStickY: Int,
)

fun normalizeAxisToInt16(value: Float): Int =
    (value * 32767f).let { Math.round(it) }.coerceIn(-32768, 32767)

fun normalizeTriggerToUint8(value: Float): Int =
    (value * 255f).let { Math.round(it) }.coerceIn(0, 255)

private fun clampI16(value: Int): Int = value.coerceIn(-32768, 32767)
private fun clampU16(value: Int): Int = value.coerceIn(0, 65535)

/**
 * GeForce NOW's on-wire input protocol wraps every event in a session clock
 * (microseconds since the input handshake), matching entities/gfn-input's
 * startInputSessionClock()/now().
 */
object GfnInputClock {
    private var startedAtNanos: Long = 0L

    fun start() {
        startedAtNanos = System.nanoTime()
    }

    // Microseconds since start(); never negative even if start() was never called.
    fun sendTimestampUs(): Long {
        if (startedAtNanos == 0L) {
            return 0L
        }
        val elapsedNanos = System.nanoTime() - startedAtNanos
        return (elapsedNanos / 1000L).coerceAtLeast(0L)
    }
}

/**
 * Encodes gamepad/mouse/keyboard state into GFN's input_channel wire format.
 * Mirrors GfnInputEncoder in inputEncoding.ts field-for-field, including the
 * protocol-v3+ event wrappers OpenNOW reverse engineered.
 */
class GfnInputEncoder {
    private var protocolVersion = 2
    private val gamepadSequence = HashMap<Int, Int>()

    fun setProtocolVersion(version: Int) {
        protocolVersion = version
    }

    fun reset() {
        gamepadSequence.clear()
    }

    private fun nextGamepadSequence(index: Int): Int {
        val current = gamepadSequence.getOrDefault(index, 1)
        gamepadSequence[index] = (current + 1) % 65536
        return current
    }

    // [0x23][8B ts][0x21][2B size BE][payload]
    private fun wrapGamepadReliable(payload: ByteArray): ByteArray {
        if (protocolVersion <= 2) {
            return payload
        }
        val buf = ByteBuffer.allocate(9 + 1 + 2 + payload.size)
        buf.put(0x23.toByte())
        buf.order(ByteOrder.BIG_ENDIAN).putLong(GfnInputClock.sendTimestampUs())
        buf.put(0x21.toByte())
        buf.putShort(payload.size.toShort())
        buf.put(payload)
        return buf.array()
    }

    // [0x23][8B ts][0x26][1B idx][2B seq BE][0x21][2B size BE][payload]
    private fun wrapGamepadPartiallyReliable(
        payload: ByteArray,
        gamepadIndex: Int,
        sequenceNumber: Int,
    ): ByteArray {
        if (protocolVersion <= 2) {
            return payload
        }
        val buf = ByteBuffer.allocate(9 + 1 + 1 + 2 + 1 + 2 + payload.size)
        buf.put(0x23.toByte())
        buf.order(ByteOrder.BIG_ENDIAN).putLong(GfnInputClock.sendTimestampUs())
        buf.put(0x26.toByte())
        buf.put((gamepadIndex and 0xff).toByte())
        buf.putShort(sequenceNumber.toShort())
        buf.put(0x21.toByte())
        buf.putShort(payload.size.toShort())
        buf.put(payload)
        return buf.array()
    }

    // v3+: [0x23][8B ts][0x22][payload]. v1-v2: raw payload, unchanged.
    private fun wrapSingleEvent(payload: ByteArray): ByteArray {
        if (protocolVersion <= 2) {
            return payload
        }
        val buf = ByteBuffer.allocate(9 + 1 + payload.size)
        buf.put(0x23.toByte())
        buf.order(ByteOrder.BIG_ENDIAN).putLong(GfnInputClock.sendTimestampUs())
        buf.put(0x22.toByte())
        buf.put(payload)
        return buf.array()
    }

    // v3+: [0x23][8B ts][0x21][2B length BE][payload]. v1-v2: raw, unchanged.
    private fun wrapMouseMoveEvent(payload: ByteArray): ByteArray {
        if (protocolVersion <= 2) {
            return payload
        }
        val buf = ByteBuffer.allocate(9 + 1 + 2 + payload.size)
        buf.put(0x23.toByte())
        buf.order(ByteOrder.BIG_ENDIAN).putLong(GfnInputClock.sendTimestampUs())
        buf.put(0x21.toByte())
        buf.putShort(payload.size.toShort())
        buf.put(payload)
        return buf.array()
    }

    // Heartbeat is sent RAW (no v3 wrapper): [u32 LE = 2].
    fun encodeHeartbeat(): ByteArray {
        val buf = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
        buf.putInt(INPUT_HEARTBEAT)
        return buf.array()
    }

    fun encodeGamepadState(
        input: GamepadInput,
        bitmap: Int,
        usePartiallyReliable: Boolean,
    ): ByteArray {
        val buf = ByteBuffer.allocate(GAMEPAD_PACKET_SIZE).order(ByteOrder.LITTLE_ENDIAN)
        buf.putInt(INPUT_GAMEPAD) // type, offset 0
        buf.putShort(26.toShort()) // payload size, offset 4
        buf.putShort((input.controllerId and 0x03).toShort()) // index, offset 6
        buf.putShort(bitmap.toShort()) // connected bitmap, offset 8
        buf.putShort(20.toShort()) // inner size, offset 10
        buf.putShort(input.buttons.toShort()) // XInput buttons, offset 12
        val packedTriggers = (input.leftTrigger and 0xff) or ((input.rightTrigger and 0xff) shl 8)
        buf.putShort(packedTriggers.toShort()) // offset 14
        buf.putShort(input.leftStickX.toShort()) // offset 16
        buf.putShort(input.leftStickY.toShort()) // offset 18
        buf.putShort(input.rightStickX.toShort()) // offset 20
        buf.putShort(input.rightStickY.toShort()) // offset 22
        buf.putShort(0.toShort()) // reserved, offset 24
        buf.putShort(85.toShort()) // magic 0x55, offset 26
        buf.putShort(0.toShort()) // reserved, offset 28
        buf.putLong(GfnInputClock.sendTimestampUs()) // timestamp (LE), offset 30
        val bytes = buf.array()

        return if (usePartiallyReliable) {
            val seq = nextGamepadSequence(input.controllerId)
            wrapGamepadPartiallyReliable(bytes, input.controllerId, seq)
        } else {
            wrapGamepadReliable(bytes)
        }
    }

    // Relative mouse move (type 7): dx/dy are pixel deltas since the last move.
    // [type 4B LE][dx 2B BE][dy 2B BE][reserved 6B BE][timestamp 8B BE]
    fun encodeMouseMove(dx: Int, dy: Int): ByteArray {
        val buf = ByteBuffer.allocate(22)
        buf.order(ByteOrder.LITTLE_ENDIAN).putInt(INPUT_MOUSE_REL)
        buf.order(ByteOrder.BIG_ENDIAN)
        buf.putShort(clampI16(dx).toShort())
        buf.putShort(clampI16(dy).toShort())
        buf.putShort(0.toShort())
        buf.putInt(0)
        buf.putLong(GfnInputClock.sendTimestampUs())
        return wrapMouseMoveEvent(buf.array())
    }

    // Absolute mouse position (type 5): x/y inside a client-chosen width/height
    // extent that the server scales onto the remote desktop.
    // [type 4B LE][x 2B BE][y 2B BE][reserved 2B BE][width 2B BE]
    // [height 2B BE][reserved 4B BE][timestamp 8B BE]
    fun encodeMouseAbsolute(x: Int, y: Int, width: Int, height: Int): ByteArray {
        val buf = ByteBuffer.allocate(26)
        buf.order(ByteOrder.LITTLE_ENDIAN).putInt(INPUT_MOUSE_ABS)
        buf.order(ByteOrder.BIG_ENDIAN)
        buf.putShort(clampU16(x).toShort())
        buf.putShort(clampU16(y).toShort())
        buf.putShort(0.toShort())
        buf.putShort(clampU16(width).toShort())
        buf.putShort(clampU16(height).toShort())
        buf.putInt(0)
        buf.putLong(GfnInputClock.sendTimestampUs())
        return wrapMouseMoveEvent(buf.array())
    }

    fun encodeMouseButtonDown(button: Int): ByteArray = encodeMouseButton(INPUT_MOUSE_BUTTON_DOWN, button)

    fun encodeMouseButtonUp(button: Int): ByteArray = encodeMouseButton(INPUT_MOUSE_BUTTON_UP, button)

    // [type 4B LE][horiz 2B BE][vert 2B BE][reserved 6B BE][timestamp 8B BE]
    fun encodeMouseWheel(delta: Int, horizontal: Int = 0): ByteArray {
        val buf = ByteBuffer.allocate(22)
        buf.order(ByteOrder.LITTLE_ENDIAN).putInt(INPUT_MOUSE_WHEEL)
        buf.order(ByteOrder.BIG_ENDIAN)
        buf.putShort(clampI16(horizontal).toShort())
        buf.putShort(clampI16(delta).toShort())
        buf.putShort(0.toShort())
        buf.putInt(0)
        buf.putLong(GfnInputClock.sendTimestampUs())
        return wrapSingleEvent(buf.array())
    }

    // [type 4B LE][button 1B][pad 1B][reserved 4B BE][timestamp 8B BE]
    private fun encodeMouseButton(type: Int, button: Int): ByteArray {
        val buf = ByteBuffer.allocate(18)
        buf.order(ByteOrder.LITTLE_ENDIAN).putInt(type)
        buf.put(button.toByte())
        buf.put(0.toByte())
        buf.order(ByteOrder.BIG_ENDIAN)
        buf.putInt(0)
        buf.putLong(GfnInputClock.sendTimestampUs())
        return wrapSingleEvent(buf.array())
    }

    fun encodeKeyDown(virtualKey: Int, modifiers: Int): ByteArray = encodeKey(INPUT_KEY_DOWN, virtualKey, modifiers)

    fun encodeKeyUp(virtualKey: Int, modifiers: Int): ByteArray = encodeKey(INPUT_KEY_UP, virtualKey, modifiers)

    // [type 4B LE][key 2B BE][modifiers 2B BE][reserved 2B BE][timestamp 8B BE]
    private fun encodeKey(type: Int, virtualKey: Int, modifiers: Int): ByteArray {
        val buf = ByteBuffer.allocate(18)
        buf.order(ByteOrder.LITTLE_ENDIAN).putInt(type)
        buf.order(ByteOrder.BIG_ENDIAN)
        buf.putShort(virtualKey.toShort())
        buf.putShort(modifiers.toShort())
        buf.putShort(0.toShort())
        buf.putLong(GfnInputClock.sendTimestampUs())
        return wrapSingleEvent(buf.array())
    }
}

/**
 * Detects the server's input handshake on input_channel_v1 and returns the
 * negotiated protocol version, or null if the message is not a handshake.
 */
fun parseInputHandshake(bytes: ByteArray): Int? {
    if (bytes.size < 2) {
        return null
    }
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    val firstWord = buf.getShort(0).toInt() and 0xffff
    if (firstWord == 526) {
        return if (bytes.size >= 4) buf.getShort(2).toInt() and 0xffff else 2
    }
    if ((bytes[0].toInt() and 0xff) == 0x0e) {
        return firstWord
    }
    return null
}
