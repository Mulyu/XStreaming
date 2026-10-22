import {createGamepadMapper} from '../gamepadMapper';

const setup = () => {
  const events: string[] = [];
  const sticks: Array<[number, number]> = [];
  const mapper = createGamepadMapper({
    press: n => events.push(`+${n}`),
    release: n => events.push(`-${n}`),
    moveLeftStick: (x, y) => sticks.push([x, y]),
  });
  return {mapper, events, sticks};
};

const KEY_W = 51;
const KEY_A = 29;
const KEY_S = 47;
const KEY_C = 31;
const KEY_CTRL = 113;
const KEY_SPACE = 62;

describe('createGamepadMapper', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps WASD to the left stick with normalized diagonals', () => {
    const {mapper, sticks} = setup();
    // Screen-down positive: W (forward) is -1, S (back) is +1.
    mapper.key(KEY_W, true);
    expect(sticks[sticks.length - 1]).toEqual([0, -1]);
    mapper.key(KEY_A, true);
    const [x, y] = sticks[sticks.length - 1];
    expect(x).toBeCloseTo(-Math.SQRT1_2);
    expect(y).toBeCloseTo(-Math.SQRT1_2);
    mapper.key(KEY_W, false);
    expect(sticks[sticks.length - 1]).toEqual([-1, 0]);
    mapper.key(KEY_S, true);
    expect(sticks[sticks.length - 1]).toEqual([-Math.SQRT1_2, Math.SQRT1_2]);
    mapper.key(KEY_S, false);
    mapper.key(KEY_A, false);
    expect(sticks[sticks.length - 1]).toEqual([0, 0]);
  });

  it('presses and releases mapped keys once', () => {
    const {mapper, events} = setup();
    mapper.key(KEY_SPACE, true);
    mapper.key(KEY_SPACE, true);
    mapper.key(KEY_SPACE, false);
    mapper.key(KEY_SPACE, false);
    expect(events).toEqual(['+A', '-A']);
  });

  it('ignores unmapped keys', () => {
    const {mapper, events, sticks} = setup();
    mapper.key(30, true);
    expect(events).toEqual([]);
    expect(sticks).toEqual([]);
  });

  it('keeps a shared button down until every input is released', () => {
    const {mapper, events} = setup();
    mapper.key(KEY_C, true);
    mapper.key(KEY_CTRL, true);
    mapper.key(KEY_C, false);
    expect(events).toEqual(['+B']);
    mapper.key(KEY_CTRL, false);
    expect(events).toEqual(['+B', '-B']);
  });

  it('maps mouse buttons to triggers', () => {
    const {mapper, events} = setup();
    mapper.mouseButton(0, true);
    mapper.mouseButton(2, true);
    mapper.mouseButton(0, false);
    mapper.mouseButton(2, false);
    expect(events).toEqual([
      '+RightTrigger',
      '+LeftTrigger',
      '-RightTrigger',
      '-LeftTrigger',
    ]);
  });

  it('taps a shoulder button per wheel notch', () => {
    jest.useFakeTimers();
    const {mapper, events} = setup();
    mapper.wheel(0, 1);
    mapper.wheel(0, -1);
    expect(events).toEqual(['+LeftShoulder', '+RightShoulder']);
    jest.advanceTimersByTime(100);
    expect(events).toEqual([
      '+LeftShoulder',
      '+RightShoulder',
      '-LeftShoulder',
      '-RightShoulder',
    ]);
  });

  it('releases everything and recentres the stick', () => {
    const {mapper, events, sticks} = setup();
    mapper.key(KEY_W, true);
    mapper.key(KEY_SPACE, true);
    mapper.mouseButton(0, true);
    mapper.releaseAll();
    expect(events).toEqual(['+A', '+RightTrigger', '-A', '-RightTrigger']);
    expect(sticks[sticks.length - 1]).toEqual([0, 0]);
    // Late key-ups after the release are no-ops.
    mapper.key(KEY_SPACE, false);
    expect(events).toHaveLength(4);
  });
});
