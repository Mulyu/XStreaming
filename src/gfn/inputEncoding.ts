// GeForce NOW input packet encoding. Ported from OpenNOW (MIT) / the official
// GFN web client's wire format. We only implement the gamepad + heartbeat path
// (keyboard/mouse are not needed for a controller-first client). Byte layouts
// are matched exactly to the reference so the server accepts the packets.

// XInput button flags.
export const GAMEPAD_DPAD_UP = 0x0001;
export const GAMEPAD_DPAD_DOWN = 0x0002;
export const GAMEPAD_DPAD_LEFT = 0x0004;
export const GAMEPAD_DPAD_RIGHT = 0x0008;
export const GAMEPAD_START = 0x0010;
export const GAMEPAD_BACK = 0x0020;
export const GAMEPAD_LS = 0x0040; // Left stick click (L3)
export const GAMEPAD_RS = 0x0080; // Right stick click (R3)
export const GAMEPAD_LB = 0x0100; // Left bumper
export const GAMEPAD_RB = 0x0200; // Right bumper
export const GAMEPAD_GUIDE = 0x0400;
export const GAMEPAD_A = 0x1000;
export const GAMEPAD_B = 0x2000;
export const GAMEPAD_X = 0x4000;
export const GAMEPAD_Y = 0x8000;

export const GAMEPAD_MAX_CONTROLLERS = 4;
export const GAMEPAD_PACKET_SIZE = 38;

const INPUT_HEARTBEAT = 2;
const INPUT_GAMEPAD = 12;

// All-controllers mask (bits 0..3).
export const PARTIALLY_RELIABLE_GAMEPAD_MASK_ALL =
  (1 << GAMEPAD_MAX_CONTROLLERS) - 1;

export type GamepadInput = {
  controllerId: number; // 0-3
  buttons: number; // 16-bit XInput flags
  leftTrigger: number; // 0-255
  rightTrigger: number; // 0-255
  leftStickX: number; // -32768..32767
  leftStickY: number; // -32768..32767 (XInput: up is positive)
  rightStickX: number;
  rightStickY: number;
};

export const normalizeAxisToInt16 = (value: number): number =>
  Math.max(-32768, Math.min(32767, Math.round(value * 32767)));

export const normalizeTriggerToUint8 = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value * 255)));

// Circular deadzone; input/output are normalized (-1..1).
export const applyDeadzone = (
  x: number,
  y: number,
  deadzone = 0.15,
): {x: number; y: number} => {
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude < deadzone) {
    return {x: 0, y: 0};
  }
  const nx = x / magnitude;
  const ny = y / magnitude;
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return {x: nx * scaled, y: ny * scaled};
};

// ---- session clock (microseconds since input handshake) ----

let inputSessionStartedAtMs = 0;

const nowMs = (): number => {
  const perf = (globalThis as any).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
};

export const startInputSessionClock = (): void => {
  inputSessionStartedAtMs = nowMs();
};

const sendTimestampUs = (): bigint =>
  BigInt(Math.max(0, Math.floor((nowMs() - inputSessionStartedAtMs) * 1000)));

const writeTimestampBE = (view: DataView, offset: number): void => {
  const ts = sendTimestampUs();
  const lo = Number(ts & 0xffffffffn);
  const hi = Number(ts >> 32n);
  view.setUint32(offset, hi, false);
  view.setUint32(offset + 4, lo, false);
};

// ---- v3+ wrappers ----

const wrapGamepadReliable = (
  payload: Uint8Array,
  protocolVersion: number,
): Uint8Array => {
  if (protocolVersion <= 2) {
    return payload;
  }
  // [0x23][8B ts][0x21][2B size BE][payload]
  const wrapped = new Uint8Array(9 + 1 + 2 + payload.length);
  const view = new DataView(wrapped.buffer);
  wrapped[0] = 0x23;
  writeTimestampBE(view, 1);
  wrapped[9] = 0x21;
  view.setUint16(10, payload.length, false);
  wrapped.set(payload, 12);
  return wrapped;
};

const wrapGamepadPartiallyReliable = (
  payload: Uint8Array,
  protocolVersion: number,
  gamepadIndex: number,
  sequenceNumber: number,
): Uint8Array => {
  if (protocolVersion <= 2) {
    return payload;
  }
  // [0x23][8B ts][0x26][1B idx][2B seq BE][0x21][2B size BE][payload]
  const wrapped = new Uint8Array(9 + 1 + 1 + 2 + 1 + 2 + payload.length);
  const view = new DataView(wrapped.buffer);
  wrapped[0] = 0x23;
  writeTimestampBE(view, 1);
  wrapped[9] = 0x26;
  wrapped[10] = gamepadIndex & 0xff;
  view.setUint16(11, sequenceNumber, false);
  wrapped[13] = 0x21;
  view.setUint16(14, payload.length, false);
  wrapped.set(payload, 16);
  return wrapped;
};

// ---- encoder ----

export class GfnInputEncoder {
  private protocolVersion = 2;
  private gamepadSequence = new Map<number, number>();

  setProtocolVersion(version: number): void {
    this.protocolVersion = version;
  }

  private nextGamepadSequence(index: number): number {
    const current = this.gamepadSequence.get(index) ?? 1;
    this.gamepadSequence.set(index, (current + 1) % 65536);
    return current;
  }

  reset(): void {
    this.gamepadSequence.clear();
  }

  // Heartbeat is sent RAW (no v3 wrapper): [u32 LE = 2].
  encodeHeartbeat(): Uint8Array {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint32(0, INPUT_HEARTBEAT, true);
    return payload;
  }

  encodeGamepadState(
    input: GamepadInput,
    bitmap: number,
    usePartiallyReliable: boolean,
  ): Uint8Array {
    const bytes = new Uint8Array(GAMEPAD_PACKET_SIZE);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, INPUT_GAMEPAD, true); // type
    view.setUint16(4, 26, true); // payload size
    view.setUint16(6, input.controllerId & 0x03, true); // index
    view.setUint16(8, bitmap, true); // connected bitmap
    view.setUint16(10, 20, true); // inner size
    view.setUint16(12, input.buttons, true); // XInput buttons
    const packedTriggers =
      (input.leftTrigger & 0xff) | ((input.rightTrigger & 0xff) << 8);
    view.setUint16(14, packedTriggers, true);
    view.setInt16(16, input.leftStickX, true);
    view.setInt16(18, input.leftStickY, true);
    view.setInt16(20, input.rightStickX, true);
    view.setInt16(22, input.rightStickY, true);
    view.setUint16(24, 0, true); // reserved
    view.setUint16(26, 85, true); // magic 0x55
    view.setUint16(28, 0, true); // reserved
    view.setBigUint64(30, sendTimestampUs(), true); // timestamp (LE)

    if (usePartiallyReliable) {
      const seq = this.nextGamepadSequence(input.controllerId);
      return wrapGamepadPartiallyReliable(
        bytes,
        this.protocolVersion,
        input.controllerId,
        seq,
      );
    }
    return wrapGamepadReliable(bytes, this.protocolVersion);
  }
}

// Detect the server's input handshake on input_channel_v1 and return the
// negotiated protocol version, or null if the message is not a handshake.
export const parseInputHandshake = (bytes: Uint8Array): number | null => {
  if (bytes.length < 2) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstWord = view.getUint16(0, true);
  if (firstWord === 526) {
    return bytes.length >= 4 ? view.getUint16(2, true) : 2;
  }
  if (bytes[0] === 0x0e) {
    return firstWord;
  }
  return null;
};
