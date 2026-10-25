import {
  DEFAULT_BINDINGS,
  KEY,
  assignKey,
  assignMouse,
  inputsForTarget,
  sanitizeBindings,
  unbindKey,
  unbindMouse,
} from '../bindings';
import {keyLabel} from '../keyNames';
import {createGamepadMapper} from '../gamepadMapper';

describe('bindings edits', () => {
  it('moves a key to its new target', () => {
    const next = assignKey(DEFAULT_BINDINGS, KEY.Space, 'Y');
    expect(next.keys[KEY.Space]).toBe('Y');
    expect(inputsForTarget(next, 'A').keys).toEqual([]);
    expect(inputsForTarget(next, 'Y').keys).toEqual([KEY.Q, KEY.Space]);
  });

  it('does not touch the defaults object', () => {
    assignKey(DEFAULT_BINDINGS, KEY.Space, 'Y');
    expect(DEFAULT_BINDINGS.keys[KEY.Space]).toBe('A');
  });

  it('unbinds keys and mouse buttons', () => {
    expect(
      unbindKey(DEFAULT_BINDINGS, KEY.Space).keys[KEY.Space],
    ).toBeUndefined();
    const withMouse = assignMouse(DEFAULT_BINDINGS, 4, 'B');
    expect(inputsForTarget(withMouse, 'B').mouse).toEqual([4]);
    expect(unbindMouse(withMouse, 4).mouse[4]).toBeUndefined();
  });

  it('lists the inputs bound to a target', () => {
    expect(inputsForTarget(DEFAULT_BINDINGS, 'B')).toEqual({
      keys: [KEY.C, KEY.CtrlLeft],
      mouse: [],
    });
    expect(inputsForTarget(DEFAULT_BINDINGS, 'RightTrigger').mouse).toEqual([
      0,
    ]);
  });
});

describe('sanitizeBindings', () => {
  it('falls back to the defaults for junk', () => {
    expect(sanitizeBindings(null)).toBe(DEFAULT_BINDINGS);
    expect(sanitizeBindings('x')).toBe(DEFAULT_BINDINGS);
  });

  it('drops unknown targets, bad codes and stick directions on the mouse', () => {
    const clean = sanitizeBindings({
      keys: {'29': 'A', '30': 'Nope', abc: 'B', '0': 'X'},
      mouse: {'0': 'A', '1': 'StickUp', '9': 'B'},
    });
    expect(clean.keys).toEqual({29: 'A'});
    expect(clean.mouse).toEqual({0: 'A'});
  });
});

describe('keyLabel', () => {
  it('names letters, digits, function keys and common keys', () => {
    expect(keyLabel(29)).toBe('A');
    expect(keyLabel(54)).toBe('Z');
    expect(keyLabel(7)).toBe('0');
    expect(keyLabel(131)).toBe('F1');
    expect(keyLabel(62)).toBe('Space');
    expect(keyLabel(9999)).toBe('#9999');
  });
});

describe('createGamepadMapper with custom bindings', () => {
  it('uses the supplied keys, including for the stick', () => {
    const events: string[] = [];
    const sticks: Array<[number, number]> = [];
    const mapper = createGamepadMapper(
      {
        press: n => events.push(`+${n}`),
        release: n => events.push(`-${n}`),
        moveLeftStick: (x, y) => sticks.push([x, y]),
      },
      {
        keys: {[KEY.ArrowUp]: 'StickUp', [KEY.Space]: 'Y'},
        mouse: {2: 'A'},
      },
    );
    mapper.key(KEY.ArrowUp, true);
    expect(sticks[sticks.length - 1]).toEqual([0, -1]);
    mapper.key(KEY.ArrowUp, false);
    mapper.key(KEY.W, true);
    expect(events).toEqual([]);
    mapper.key(KEY.Space, true);
    mapper.mouseButton(2, true);
    mapper.mouseButton(0, true);
    expect(events).toEqual(['+Y', '+A']);
  });
});
