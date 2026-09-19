import {
  KEY_MOD_ALT,
  KEY_MOD_CTRL,
  KEY_MOD_META,
  KEY_MOD_SHIFT,
  VK,
} from '../gfn/inputEncoding';

export type PickableKey = {
  vk: number;
  label: string;
};

export type KeyCategory = {
  name: string;
  keys: PickableKey[];
};

const letters: PickableKey[] = 'QWERTYUIOPASDFGHJKLZXCVBNM'
  .split('')
  .map(letter => ({vk: (VK as Record<string, number>)[letter], label: letter}));

const numbers: PickableKey[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
  vk: (VK as Record<string, number>)[`Digit${n}`],
  label: String(n),
}));

const modifiers: PickableKey[] = [
  {vk: VK.LeftShift, label: 'Shift'},
  {vk: VK.LeftCtrl, label: 'Ctrl'},
  {vk: VK.LeftAlt, label: 'Alt'},
  {vk: VK.Meta, label: 'Win'},
];

const navigation: PickableKey[] = [
  {vk: VK.Up, label: '↑'},
  {vk: VK.Down, label: '↓'},
  {vk: VK.Left, label: '←'},
  {vk: VK.Right, label: '→'},
  {vk: VK.Home, label: 'Home'},
  {vk: VK.End, label: 'End'},
  {vk: VK.PageUp, label: 'PgUp'},
  {vk: VK.PageDown, label: 'PgDn'},
  {vk: VK.Insert, label: 'Ins'},
  {vk: VK.Delete, label: 'Del'},
];

const functionKeys: PickableKey[] = [
  {vk: VK.Escape, label: 'Esc'},
  {vk: VK.F1, label: 'F1'},
  {vk: VK.F2, label: 'F2'},
  {vk: VK.F3, label: 'F3'},
  {vk: VK.F4, label: 'F4'},
  {vk: VK.F5, label: 'F5'},
  {vk: VK.F6, label: 'F6'},
  {vk: VK.F7, label: 'F7'},
  {vk: VK.F8, label: 'F8'},
  {vk: VK.F9, label: 'F9'},
  {vk: VK.F10, label: 'F10'},
  {vk: VK.F11, label: 'F11'},
  {vk: VK.F12, label: 'F12'},
];

const editing: PickableKey[] = [
  {vk: VK.Enter, label: 'Enter'},
  {vk: VK.Backspace, label: '⌫'},
  {vk: VK.Tab, label: 'Tab'},
  {vk: VK.Space, label: 'Space'},
  {vk: VK.CapsLock, label: 'Caps'},
  {vk: VK.Backquote, label: '`'},
  {vk: VK.Minus, label: '-'},
  {vk: VK.Equal, label: '='},
  {vk: VK.BracketLeft, label: '['},
  {vk: VK.BracketRight, label: ']'},
  {vk: VK.Backslash, label: '\\'},
  {vk: VK.Semicolon, label: ';'},
  {vk: VK.Quote, label: "'"},
  {vk: VK.Comma, label: ','},
  {vk: VK.Period, label: '.'},
  {vk: VK.Slash, label: '/'},
];

// Categorized, in the order the key picker groups them.
export const KEY_CATEGORIES: KeyCategory[] = [
  {name: 'Letters', keys: letters},
  {name: 'Numbers', keys: numbers},
  {name: 'Modifiers', keys: modifiers},
  {name: 'Navigation', keys: navigation},
  {name: 'Function', keys: functionKeys},
  {name: 'Editing', keys: editing},
];

// Any VK a placed key button might carry that's one of the four standard
// modifiers -- used so a custom key button configured as e.g. Shift shares
// the same live latch state as the full VirtualKeyboard's own Shift key,
// instead of each surface tracking "is Shift held" independently.
export const VK_TO_MOD_BIT: Record<number, number> = {
  [VK.LeftShift]: KEY_MOD_SHIFT,
  [VK.LeftCtrl]: KEY_MOD_CTRL,
  [VK.LeftAlt]: KEY_MOD_ALT,
  [VK.Meta]: KEY_MOD_META,
};

// The reverse of the above, used to release a latched modifier's key on
// cleanup (hide/unmount/disconnect) without needing to know which surface
// (VirtualKeyboard or a custom key button) last latched it.
export const MOD_BIT_TO_VK: Record<number, number> = {
  [KEY_MOD_SHIFT]: VK.LeftShift,
  [KEY_MOD_CTRL]: VK.LeftCtrl,
  [KEY_MOD_ALT]: VK.LeftAlt,
  [KEY_MOD_META]: VK.Meta,
};

export const findKeyLabel = (vk: number): string => {
  for (const category of KEY_CATEGORIES) {
    const found = category.keys.find(k => k.vk === vk);
    if (found) {
      return found.label;
    }
  }
  return '?';
};
