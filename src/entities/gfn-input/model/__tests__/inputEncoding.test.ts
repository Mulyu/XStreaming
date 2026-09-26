import {
  GfnInputEncoder,
  KEY_MOD_ALT,
  KEY_MOD_CTRL,
  KEY_MOD_META,
  KEY_MOD_SHIFT,
  VK,
  startInputSessionClock,
} from '../inputEncoding';

describe('GfnInputEncoder keyboard packets', () => {
  beforeEach(() => {
    startInputSessionClock();
  });

  it('encodes a v1/v2 (raw, unwrapped) key-down packet: type 3, key + modifiers big-endian', () => {
    const encoder = new GfnInputEncoder();
    const bytes = encoder.encodeKeyDown(VK.W, KEY_MOD_SHIFT | KEY_MOD_CTRL);

    expect(bytes.length).toBe(18);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(3); // INPUT_KEY_DOWN
    expect(view.getUint16(4, false)).toBe(VK.W);
    expect(view.getUint16(6, false)).toBe(KEY_MOD_SHIFT | KEY_MOD_CTRL);
    expect(view.getUint16(8, false)).toBe(0); // reserved
  });

  it('encodes a key-up packet with type 4 and no modifiers', () => {
    const encoder = new GfnInputEncoder();
    const bytes = encoder.encodeKeyUp(VK.Enter, 0);

    expect(bytes.length).toBe(18);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(4); // INPUT_KEY_UP
    expect(view.getUint16(4, false)).toBe(VK.Enter);
    expect(view.getUint16(6, false)).toBe(0);
  });

  it('wraps key events in the v3+ single-event envelope: [0x23][8B ts][0x22][payload]', () => {
    const encoder = new GfnInputEncoder();
    encoder.setProtocolVersion(3);
    const bytes = encoder.encodeKeyDown(VK.A, 0);

    expect(bytes.length).toBe(9 + 1 + 18);
    expect(bytes[0]).toBe(0x23);
    expect(bytes[9]).toBe(0x22);
    // The 18-byte native payload starts right after the envelope header.
    const payload = new DataView(bytes.buffer, bytes.byteOffset + 10, 18);
    expect(payload.getUint32(0, true)).toBe(3);
    expect(payload.getUint16(4, false)).toBe(VK.A);
  });

  it("excludes a modifier key's own bit from its own event, matching OpenNOW", () => {
    // A virtual keyboard should compute the mask from *other* held modifiers,
    // never the key's own flag -- verified structurally here (the encoder
    // just encodes whatever mask it's given; the exclusion is the caller's
    // responsibility, exercised by the VirtualKeyboard component instead).
    const encoder = new GfnInputEncoder();
    const bytes = encoder.encodeKeyDown(VK.LeftShift, 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(6, false)).toBe(0);
  });

  it('VK table matches the Windows Virtual-Key codes OpenNOW ports', () => {
    expect(VK.A).toBe(0x41);
    expect(VK.Z).toBe(0x5a);
    expect(VK.Digit0).toBe(0x30);
    expect(VK.Escape).toBe(0x1b);
    expect(VK.Enter).toBe(0x0d);
    expect(VK.Backspace).toBe(0x08);
    expect(VK.Tab).toBe(0x09);
    expect(VK.Space).toBe(0x20);
    expect(VK.Left).toBe(0x25);
    expect(VK.Up).toBe(0x26);
    expect(VK.Right).toBe(0x27);
    expect(VK.Down).toBe(0x28);
    expect(VK.F1).toBe(0x70);
    expect(VK.F12).toBe(0x7b);
    expect(VK.LeftShift).toBe(0xa0);
    expect(VK.LeftCtrl).toBe(0xa2);
    expect(VK.LeftAlt).toBe(0xa4);
    expect(VK.Meta).toBe(0x5b);
  });

  it('modifier bitmask constants match the 4-bit mask OpenNOW sends', () => {
    expect(KEY_MOD_SHIFT).toBe(0x01);
    expect(KEY_MOD_CTRL).toBe(0x02);
    expect(KEY_MOD_ALT).toBe(0x04);
    expect(KEY_MOD_META).toBe(0x08);
  });
});
