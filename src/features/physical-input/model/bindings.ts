// Which gamepad input each physical key / mouse button stands for, for the
// providers that have no keyboard or mouse channel of their own (xCloud, PS
// Plus). The defaults are the standard FPS-style layout the app always used;
// the user's changes are stored on top (see bindingsStore.ts) and edited on
// the input-mapping screen.

export type GamepadButtonName =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LeftShoulder'
  | 'RightShoulder'
  | 'LeftTrigger'
  | 'RightTrigger'
  | 'LeftThumb'
  | 'RightThumb'
  | 'View'
  | 'Menu'
  | 'Nexus'
  | 'DPadUp'
  | 'DPadDown'
  | 'DPadLeft'
  | 'DPadRight';

// The left stick is moved by four direction keys.
export type StickDirection =
  | 'StickUp'
  | 'StickDown'
  | 'StickLeft'
  | 'StickRight';

export type BindingTarget = GamepadButtonName | StickDirection;

export const STICK_DIRECTIONS: StickDirection[] = [
  'StickUp',
  'StickDown',
  'StickLeft',
  'StickRight',
];

// The order the editor lists them in.
export const BINDING_TARGETS: BindingTarget[] = [
  'StickUp',
  'StickLeft',
  'StickDown',
  'StickRight',
  'A',
  'B',
  'X',
  'Y',
  'LeftShoulder',
  'RightShoulder',
  'LeftTrigger',
  'RightTrigger',
  'LeftThumb',
  'RightThumb',
  'View',
  'Menu',
  'Nexus',
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
];

export const isStickDirection = (
  target: BindingTarget,
): target is StickDirection => target.startsWith('Stick');

export type InputBindings = {
  // Android KeyEvent.KEYCODE_* -> target.
  keys: Record<number, BindingTarget>;
  // DOM MouseEvent.button numbering (0 left, 1 middle, 2 right, 3 back,
  // 4 forward) -> button.
  mouse: Record<number, GamepadButtonName>;
};

// Android KeyEvent.KEYCODE_* values.
export const KEY = {
  A: 29,
  C: 31,
  D: 32,
  E: 33,
  G: 35,
  Q: 45,
  R: 46,
  S: 47,
  V: 50,
  W: 51,
  Tab: 61,
  Space: 62,
  Enter: 66,
  Escape: 111,
  ShiftLeft: 59,
  ShiftRight: 60,
  CtrlLeft: 113,
  CtrlRight: 114,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  F1: 131,
} as const;

export const DEFAULT_BINDINGS: InputBindings = {
  keys: {
    [KEY.W]: 'StickUp',
    [KEY.S]: 'StickDown',
    [KEY.A]: 'StickLeft',
    [KEY.D]: 'StickRight',
    [KEY.Space]: 'A',
    [KEY.C]: 'B',
    [KEY.CtrlLeft]: 'B',
    [KEY.E]: 'X',
    [KEY.R]: 'X',
    [KEY.Q]: 'Y',
    [KEY.ShiftLeft]: 'LeftThumb',
    [KEY.ShiftRight]: 'LeftThumb',
    [KEY.V]: 'RightThumb',
    [KEY.G]: 'LeftShoulder',
    [KEY.Tab]: 'View',
    [KEY.Escape]: 'Menu',
    [KEY.Enter]: 'Menu',
    [KEY.F1]: 'Nexus',
    [KEY.ArrowUp]: 'DPadUp',
    [KEY.ArrowDown]: 'DPadDown',
    [KEY.ArrowLeft]: 'DPadLeft',
    [KEY.ArrowRight]: 'DPadRight',
  },
  mouse: {
    0: 'RightTrigger',
    1: 'RightThumb',
    2: 'LeftTrigger',
    3: 'LeftShoulder',
  },
};

export const MOUSE_BUTTON_IDS = [0, 1, 2, 3, 4] as const;

const TARGET_SET = new Set<string>(BINDING_TARGETS);

// Reads stored bindings defensively: anything that isn't a known target on a
// numeric key is dropped, and a missing/invalid value falls back to defaults.
export const sanitizeBindings = (raw: any): InputBindings => {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_BINDINGS;
  }
  const keys: Record<number, BindingTarget> = {};
  Object.keys(raw.keys ?? {}).forEach(k => {
    const code = Number(k);
    const target = raw.keys[k];
    if (Number.isInteger(code) && code > 0 && TARGET_SET.has(target)) {
      keys[code] = target;
    }
  });
  const mouse: Record<number, GamepadButtonName> = {};
  Object.keys(raw.mouse ?? {}).forEach(k => {
    const button = Number(k);
    const target = raw.mouse[k];
    if (
      MOUSE_BUTTON_IDS.includes(button as any) &&
      TARGET_SET.has(target) &&
      !isStickDirection(target)
    ) {
      mouse[button] = target;
    }
  });
  return {keys, mouse};
};

// ---- Edits (pure) ----

// A key stands for one target: assigning it moves it off any other.
export const assignKey = (
  bindings: InputBindings,
  keyCode: number,
  target: BindingTarget,
): InputBindings => ({
  ...bindings,
  keys: {...bindings.keys, [keyCode]: target},
});

export const unbindKey = (
  bindings: InputBindings,
  keyCode: number,
): InputBindings => {
  const keys = {...bindings.keys};
  delete keys[keyCode];
  return {...bindings, keys};
};

export const assignMouse = (
  bindings: InputBindings,
  button: number,
  target: GamepadButtonName,
): InputBindings => ({
  ...bindings,
  mouse: {...bindings.mouse, [button]: target},
});

export const unbindMouse = (
  bindings: InputBindings,
  button: number,
): InputBindings => {
  const mouse = {...bindings.mouse};
  delete mouse[button];
  return {...bindings, mouse};
};

// The inputs bound to one target, in a stable order.
export const inputsForTarget = (
  bindings: InputBindings,
  target: BindingTarget,
): {keys: number[]; mouse: number[]} => ({
  keys: Object.keys(bindings.keys)
    .map(Number)
    .filter(code => bindings.keys[code] === target)
    .sort((a, b) => a - b),
  mouse: Object.keys(bindings.mouse)
    .map(Number)
    .filter(button => bindings.mouse[button] === target)
    .sort((a, b) => a - b),
});
