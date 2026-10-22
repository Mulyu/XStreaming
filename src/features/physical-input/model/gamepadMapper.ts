// Keyboard/mouse -> gamepad translation for providers whose wire protocol has
// no keyboard or mouse channel (xCloud, PS Plus). Pure: the screen supplies a
// sink that drives its own press/stick/aim handlers, so the mapped input goes
// through the exact same path (turbo, hold-toggle, swipe-aim gating) as the
// on-screen gamepad.

// Android KeyEvent.KEYCODE_* values.
const KEY = {
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

// Standard FPS-style layout. WASD is the left stick (handled separately).
const KEY_BUTTONS: Record<number, GamepadButtonName> = {
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
};

// DOM button numbering (see PhysicalMouseButton).
const MOUSE_BUTTONS: Record<number, GamepadButtonName> = {
  0: 'RightTrigger',
  1: 'RightThumb',
  2: 'LeftTrigger',
  3: 'LeftShoulder',
  4: 'RightShoulder',
};

// Wheel notches fire a short tap on a shoulder button (weapon switch).
const WHEEL_TAP_MS = 60;

export type GamepadMapperSink = {
  press: (name: GamepadButtonName) => void;
  release: (name: GamepadButtonName) => void;
  moveLeftStick: (x: number, y: number) => void;
};

export type GamepadMapper = {
  key: (keyCode: number, down: boolean) => void;
  mouseButton: (button: number, down: boolean) => void;
  wheel: (x: number, y: number) => void;
  // Releases everything currently held (focus loss, capture released).
  releaseAll: () => void;
};

export const createGamepadMapper = (sink: GamepadMapperSink): GamepadMapper => {
  // Count per button so two inputs mapped to one button (e.g. C and Ctrl ->
  // B) don't release it while the other is still held.
  const held = new Map<GamepadButtonName, number>();
  const keyHeld = new Map<number, GamepadButtonName>();
  const mouseHeld = new Map<number, GamepadButtonName>();
  const moveKeys = new Set<number>();
  const wheelTimers = new Set<ReturnType<typeof setTimeout>>();

  const acquire = (name: GamepadButtonName) => {
    const count = held.get(name) ?? 0;
    held.set(name, count + 1);
    if (count === 0) {
      sink.press(name);
    }
  };
  const drop = (name: GamepadButtonName) => {
    const count = held.get(name) ?? 0;
    if (count <= 1) {
      held.delete(name);
      if (count === 1) {
        sink.release(name);
      }
    } else {
      held.set(name, count - 1);
    }
  };

  let stickX = 0;
  let stickY = 0;
  const updateStick = () => {
    let x = 0;
    let y = 0;
    if (moveKeys.has(KEY.D)) {
      x += 1;
    }
    if (moveKeys.has(KEY.A)) {
      x -= 1;
    }
    // gpState's left stick Y is screen-down positive (what the on-screen
    // stick reports; xCloud/GFN negate it on the wire, PS Plus sends it as
    // is), so forward (W) is negative.
    if (moveKeys.has(KEY.W)) {
      y -= 1;
    }
    if (moveKeys.has(KEY.S)) {
      y += 1;
    }
    // Diagonals are normalized so they don't outrun straight movement.
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    if (x !== stickX || y !== stickY) {
      stickX = x;
      stickY = y;
      sink.moveLeftStick(x, y);
    }
  };

  const isMoveKey = (keyCode: number) =>
    keyCode === KEY.W ||
    keyCode === KEY.A ||
    keyCode === KEY.S ||
    keyCode === KEY.D;

  return {
    key: (keyCode, down) => {
      if (isMoveKey(keyCode)) {
        if (down) {
          moveKeys.add(keyCode);
        } else {
          moveKeys.delete(keyCode);
        }
        updateStick();
        return;
      }
      const name = KEY_BUTTONS[keyCode];
      if (!name) {
        return;
      }
      if (down) {
        if (!keyHeld.has(keyCode)) {
          keyHeld.set(keyCode, name);
          acquire(name);
        }
      } else if (keyHeld.has(keyCode)) {
        keyHeld.delete(keyCode);
        drop(name);
      }
    },
    mouseButton: (button, down) => {
      const name = MOUSE_BUTTONS[button];
      if (!name) {
        return;
      }
      if (down) {
        if (!mouseHeld.has(button)) {
          mouseHeld.set(button, name);
          acquire(name);
        }
      } else if (mouseHeld.has(button)) {
        mouseHeld.delete(button);
        drop(name);
      }
    },
    wheel: (x, y) => {
      const delta = y !== 0 ? y : x;
      if (delta === 0) {
        return;
      }
      // Up = previous weapon (LB), down = next (RB).
      const name: GamepadButtonName =
        delta > 0 ? 'LeftShoulder' : 'RightShoulder';
      acquire(name);
      const timer = setTimeout(() => {
        wheelTimers.delete(timer);
        drop(name);
      }, WHEEL_TAP_MS);
      wheelTimers.add(timer);
    },
    releaseAll: () => {
      wheelTimers.forEach(clearTimeout);
      wheelTimers.clear();
      keyHeld.clear();
      mouseHeld.clear();
      moveKeys.clear();
      held.forEach((_count, name) => sink.release(name));
      held.clear();
      updateStick();
    },
  };
};
