// Keyboard/mouse -> gamepad translation for providers whose wire protocol has
// no keyboard or mouse channel (xCloud, PS Plus). Pure: the screen supplies a
// sink that drives its own press/stick/aim handlers, so the mapped input goes
// through the exact same path (turbo, hold-toggle, swipe-aim gating) as the
// on-screen gamepad.

import {
  BindingTarget,
  DEFAULT_BINDINGS,
  GamepadButtonName,
  InputBindings,
  StickDirection,
  isStickDirection,
} from './bindings';

export type {GamepadButtonName} from './bindings';

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

export const createGamepadMapper = (
  sink: GamepadMapperSink,
  bindings: InputBindings = DEFAULT_BINDINGS,
): GamepadMapper => {
  // Count per button so two inputs mapped to one button (e.g. C and Ctrl ->
  // B) don't release it while the other is still held.
  const held = new Map<GamepadButtonName, number>();
  const keyHeld = new Map<number, GamepadButtonName>();
  const mouseHeld = new Map<number, GamepadButtonName>();
  // Held keys bound to a stick direction, by key code.
  const stickKeys = new Map<number, StickDirection>();
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
    const dirs = new Set(stickKeys.values());
    let x = 0;
    let y = 0;
    if (dirs.has('StickRight')) {
      x += 1;
    }
    if (dirs.has('StickLeft')) {
      x -= 1;
    }
    // gpState's left stick Y is screen-down positive (what the on-screen
    // stick reports; xCloud/GFN negate it on the wire, PS Plus sends it as
    // is), so forward (W) is negative.
    if (dirs.has('StickUp')) {
      y -= 1;
    }
    if (dirs.has('StickDown')) {
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

  return {
    key: (keyCode, down) => {
      const target: BindingTarget | undefined = bindings.keys[keyCode];
      if (!target) {
        return;
      }
      if (isStickDirection(target)) {
        if (down) {
          stickKeys.set(keyCode, target);
        } else {
          stickKeys.delete(keyCode);
        }
        updateStick();
        return;
      }
      const name = target;
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
      const name = bindings.mouse[button];
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
      stickKeys.clear();
      held.forEach((_count, name) => sink.release(name));
      held.clear();
      updateStick();
    },
  };
};
