import {androidKeyCodeToVk, modifierMaskFromMetaState} from '../androidKeyMap';
import {
  KEY_MOD_ALT,
  KEY_MOD_CTRL,
  KEY_MOD_META,
  KEY_MOD_SHIFT,
  VK,
} from '../inputEncoding';

// Android KeyEvent constants, as printed by javap against android.jar.
const KEYCODE_A = 29;
const KEYCODE_Z = 54;
const KEYCODE_0 = 7;
const KEYCODE_SHIFT_LEFT = 59;
const KEYCODE_CTRL_RIGHT = 114;
const KEYCODE_ENTER = 66;
const KEYCODE_NUMPAD_ENTER = 160;
const KEYCODE_F12 = 142;
const KEYCODE_DEL = 67;
const KEYCODE_FORWARD_DEL = 112;
const KEYCODE_BACK = 4;

const META_SHIFT_ON = 0x1;
const META_ALT_ON = 0x2;
const META_CTRL_ON = 0x1000;
const META_META_ON = 0x10000;

describe('androidKeyCodeToVk', () => {
  it('maps letters, digits and function keys', () => {
    expect(androidKeyCodeToVk(KEYCODE_A)).toBe(VK.A);
    expect(androidKeyCodeToVk(KEYCODE_Z)).toBe(VK.Z);
    expect(androidKeyCodeToVk(KEYCODE_0)).toBe(VK.Digit0);
    expect(androidKeyCodeToVk(KEYCODE_F12)).toBe(VK.F12);
  });

  it('keeps left/right modifiers distinct', () => {
    expect(androidKeyCodeToVk(KEYCODE_SHIFT_LEFT)).toBe(VK.LeftShift);
    expect(androidKeyCodeToVk(KEYCODE_CTRL_RIGHT)).toBe(VK.RightCtrl);
  });

  it('maps Android DEL to Backspace and FORWARD_DEL to Delete', () => {
    expect(androidKeyCodeToVk(KEYCODE_DEL)).toBe(VK.Backspace);
    expect(androidKeyCodeToVk(KEYCODE_FORWARD_DEL)).toBe(VK.Delete);
  });

  it('maps both Enter keys to Enter', () => {
    expect(androidKeyCodeToVk(KEYCODE_ENTER)).toBe(VK.Enter);
    expect(androidKeyCodeToVk(KEYCODE_NUMPAD_ENTER)).toBe(VK.Enter);
  });

  it('leaves system keys unmapped', () => {
    expect(androidKeyCodeToVk(KEYCODE_BACK)).toBeUndefined();
  });
});

describe('modifierMaskFromMetaState', () => {
  it('translates the held modifiers into GFN bits', () => {
    expect(modifierMaskFromMetaState(0)).toBe(0);
    expect(modifierMaskFromMetaState(META_SHIFT_ON | META_CTRL_ON)).toBe(
      KEY_MOD_SHIFT | KEY_MOD_CTRL,
    );
    expect(modifierMaskFromMetaState(META_ALT_ON | META_META_ON)).toBe(
      KEY_MOD_ALT | KEY_MOD_META,
    );
  });

  it("leaves a modifier key's own bit out of its own event", () => {
    expect(
      modifierMaskFromMetaState(META_SHIFT_ON | META_CTRL_ON, VK.LeftShift),
    ).toBe(KEY_MOD_CTRL);
    expect(modifierMaskFromMetaState(META_CTRL_ON, VK.RightCtrl)).toBe(0);
  });

  it('keeps every bit for an ordinary key', () => {
    expect(modifierMaskFromMetaState(META_SHIFT_ON, VK.W)).toBe(KEY_MOD_SHIFT);
  });
});
