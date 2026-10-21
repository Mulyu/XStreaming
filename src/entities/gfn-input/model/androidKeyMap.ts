import {
  VK,
  KEY_MOD_SHIFT,
  KEY_MOD_CTRL,
  KEY_MOD_ALT,
  KEY_MOD_META,
} from './inputEncoding';

// Android KeyEvent.KEYCODE_* -> Windows virtual-key (VK_*) codes, for turning
// a physical keyboard's events into GFN key packets. US layout, like the VK
// table itself; keys with no PC equivalent are simply absent.
const ANDROID_TO_VK: Record<number, number> = {
  // 0-9
  7: VK.Digit0,
  8: VK.Digit1,
  9: VK.Digit2,
  10: VK.Digit3,
  11: VK.Digit4,
  12: VK.Digit5,
  13: VK.Digit6,
  14: VK.Digit7,
  15: VK.Digit8,
  16: VK.Digit9,
  // A-Z
  29: VK.A,
  30: VK.B,
  31: VK.C,
  32: VK.D,
  33: VK.E,
  34: VK.F,
  35: VK.G,
  36: VK.H,
  37: VK.I,
  38: VK.J,
  39: VK.K,
  40: VK.L,
  41: VK.M,
  42: VK.N,
  43: VK.O,
  44: VK.P,
  45: VK.Q,
  46: VK.R,
  47: VK.S,
  48: VK.T,
  49: VK.U,
  50: VK.V,
  51: VK.W,
  52: VK.X,
  53: VK.Y,
  54: VK.Z,
  // Punctuation
  55: VK.Comma,
  56: VK.Period,
  68: VK.Backquote,
  69: VK.Minus,
  70: VK.Equal,
  71: VK.BracketLeft,
  72: VK.BracketRight,
  73: VK.Backslash,
  74: VK.Semicolon,
  75: VK.Quote,
  76: VK.Slash,
  // Modifiers
  57: VK.LeftAlt,
  58: VK.RightAlt,
  59: VK.LeftShift,
  60: VK.RightShift,
  113: VK.LeftCtrl,
  114: VK.RightCtrl,
  117: VK.Meta,
  118: VK.Meta,
  // Editing / whitespace
  61: VK.Tab,
  62: VK.Space,
  66: VK.Enter,
  67: VK.Backspace, // KEYCODE_DEL
  111: VK.Escape,
  112: VK.Delete, // KEYCODE_FORWARD_DEL
  115: VK.CapsLock,
  116: VK.ScrollLock,
  120: VK.PrintScreen, // KEYCODE_SYSRQ
  121: VK.Pause, // KEYCODE_BREAK
  124: VK.Insert,
  // Navigation
  19: VK.Up,
  20: VK.Down,
  21: VK.Left,
  22: VK.Right,
  92: VK.PageUp,
  93: VK.PageDown,
  122: VK.Home,
  123: VK.End,
  // F1-F12
  131: VK.F1,
  132: VK.F2,
  133: VK.F3,
  134: VK.F4,
  135: VK.F5,
  136: VK.F6,
  137: VK.F7,
  138: VK.F8,
  139: VK.F9,
  140: VK.F10,
  141: VK.F11,
  142: VK.F12,
  // Numpad
  143: VK.NumLock,
  144: VK.Numpad0,
  145: VK.Numpad1,
  146: VK.Numpad2,
  147: VK.Numpad3,
  148: VK.Numpad4,
  149: VK.Numpad5,
  150: VK.Numpad6,
  151: VK.Numpad7,
  152: VK.Numpad8,
  153: VK.Numpad9,
  154: VK.NumpadDivide,
  155: VK.NumpadMultiply,
  156: VK.NumpadSubtract,
  157: VK.NumpadAdd,
  158: VK.NumpadDecimal,
  160: VK.Enter, // KEYCODE_NUMPAD_ENTER
};

export const androidKeyCodeToVk = (keyCode: number): number | undefined =>
  ANDROID_TO_VK[keyCode];

// KeyEvent.META_*_ON generic bits (not the left/right variants, which Android
// sets alongside them).
const META_SHIFT_ON = 0x1;
const META_ALT_ON = 0x2;
const META_CTRL_ON = 0x1000;
const META_META_ON = 0x10000;

const VK_TO_MOD_BIT: Record<number, number> = {
  [VK.LeftShift]: KEY_MOD_SHIFT,
  [VK.RightShift]: KEY_MOD_SHIFT,
  [VK.LeftCtrl]: KEY_MOD_CTRL,
  [VK.RightCtrl]: KEY_MOD_CTRL,
  [VK.LeftAlt]: KEY_MOD_ALT,
  [VK.RightAlt]: KEY_MOD_ALT,
  [VK.Meta]: KEY_MOD_META,
};

// The live modifier bitmask GFN wants alongside each key packet, from an
// Android KeyEvent.getMetaState(). A modifier key's own event leaves its own
// bit out, matching the virtual keyboard's behavior (see KEY_MOD_* docs).
export const modifierMaskFromMetaState = (
  metaState: number,
  keyVk?: number,
): number => {
  let mask = 0;
  if (metaState & META_SHIFT_ON) {
    mask |= KEY_MOD_SHIFT;
  }
  if (metaState & META_CTRL_ON) {
    mask |= KEY_MOD_CTRL;
  }
  if (metaState & META_ALT_ON) {
    mask |= KEY_MOD_ALT;
  }
  if (metaState & META_META_ON) {
    mask |= KEY_MOD_META;
  }
  if (keyVk !== undefined && VK_TO_MOD_BIT[keyVk] !== undefined) {
    mask &= ~VK_TO_MOD_BIT[keyVk];
  }
  return mask;
};
