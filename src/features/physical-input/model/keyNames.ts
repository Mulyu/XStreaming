// Short labels for Android KeyEvent.KEYCODE_* values, for showing which key a
// binding uses.

const NAMED: Record<number, string> = {
  19: '↑',
  20: '↓',
  21: '←',
  22: '→',
  55: ',',
  56: '.',
  57: 'Alt',
  58: 'Alt',
  59: 'Shift',
  60: 'Shift',
  61: 'Tab',
  62: 'Space',
  66: 'Enter',
  67: 'Backspace',
  68: '`',
  69: '-',
  70: '=',
  71: '[',
  72: ']',
  73: '\\',
  74: ';',
  75: "'",
  76: '/',
  92: 'PgUp',
  93: 'PgDn',
  111: 'Esc',
  112: 'Del',
  113: 'Ctrl',
  114: 'Ctrl',
  115: 'Caps',
  122: 'Home',
  123: 'End',
  124: 'Ins',
};

export const keyLabel = (keyCode: number): string => {
  if (NAMED[keyCode]) {
    return NAMED[keyCode];
  }
  // A..Z
  if (keyCode >= 29 && keyCode <= 54) {
    return String.fromCharCode(65 + keyCode - 29);
  }
  // 0..9
  if (keyCode >= 7 && keyCode <= 16) {
    return String(keyCode - 7);
  }
  // F1..F12
  if (keyCode >= 131 && keyCode <= 142) {
    return `F${keyCode - 130}`;
  }
  return `#${keyCode}`;
};
