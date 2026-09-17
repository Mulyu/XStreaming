import {GfnTouchGestureTracker} from '../touchGesture';
import {MOUSE_LEFT, MOUSE_RIGHT} from '../inputEncoding';

const makeCallbacks = () => ({
  moveCursor: jest.fn(),
  buttonDown: jest.fn(),
  buttonUp: jest.fn(),
  wheel: jest.fn(),
});

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('GfnTouchGestureTracker', () => {
  it('commits a single finger held past the detection window: warp + left down, then moves live', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([{type: 'pointerdown', pointerId: 1, x: 0.2, y: 0.3}]);
    expect(callbacks.moveCursor).not.toHaveBeenCalled();
    expect(callbacks.buttonDown).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60);
    expect(callbacks.moveCursor).toHaveBeenCalledWith(0.2, 0.3, true);
    expect(callbacks.buttonDown).toHaveBeenCalledWith(MOUSE_LEFT);

    tracker.handleEvents([
      {type: 'pointermove', pointerId: 1, x: 0.25, y: 0.35},
    ]);
    expect(callbacks.moveCursor).toHaveBeenLastCalledWith(0.25, 0.35, false);

    tracker.handleEvents([{type: 'pointerup', pointerId: 1, x: 0.3, y: 0.4}]);
    expect(callbacks.moveCursor).toHaveBeenLastCalledWith(0.3, 0.4, true);
    expect(callbacks.buttonUp).toHaveBeenCalledWith(MOUSE_LEFT);
  });

  it('commits a fast tap immediately on release instead of waiting out the window', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([
      {type: 'pointerdown', pointerId: 1, x: 0.5, y: 0.5},
      {type: 'pointerup', pointerId: 1, x: 0.5, y: 0.5},
    ]);

    expect(callbacks.buttonDown).toHaveBeenCalledWith(MOUSE_LEFT);
    expect(callbacks.buttonUp).toHaveBeenCalledWith(MOUSE_LEFT);
    // Letting the (already-cleared) timer's original delay elapse must not
    // double-fire the commit.
    jest.advanceTimersByTime(60);
    expect(callbacks.buttonDown).toHaveBeenCalledTimes(1);
  });

  it('turns a second finger landing inside the window into a two-finger gesture, suppressing the left click', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([
      {type: 'pointerdown', pointerId: 1, x: 0.5, y: 0.5},
      {type: 'pointerdown', pointerId: 2, x: 0.5, y: 0.6},
    ]);
    jest.advanceTimersByTime(60);

    expect(callbacks.moveCursor).not.toHaveBeenCalled();
    expect(callbacks.buttonDown).not.toHaveBeenCalled();
  });

  it('sends a right-click when two fingers tap together without moving', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([
      {type: 'pointerdown', pointerId: 1, x: 0.5, y: 0.5},
      {type: 'pointerdown', pointerId: 2, x: 0.5, y: 0.6},
      {type: 'pointerup', pointerId: 1, x: 0.5, y: 0.5},
      {type: 'pointerup', pointerId: 2, x: 0.5, y: 0.6},
    ]);

    expect(callbacks.buttonDown).toHaveBeenCalledWith(MOUSE_RIGHT);
    expect(callbacks.buttonUp).toHaveBeenCalledWith(MOUSE_RIGHT);
    expect(callbacks.moveCursor).not.toHaveBeenCalled();
  });

  it('scrolls on a two-finger vertical drag instead of right-clicking on release', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([
      {type: 'pointerdown', pointerId: 1, x: 0.5, y: 0.5},
      {type: 'pointerdown', pointerId: 2, x: 0.5, y: 0.6},
      {type: 'pointermove', pointerId: 1, x: 0.5, y: 0.4},
      {type: 'pointermove', pointerId: 2, x: 0.5, y: 0.5},
    ]);

    expect(callbacks.wheel).toHaveBeenCalled();
    const delta = callbacks.wheel.mock.calls[0][0];
    // Fingers moved up (y decreased) -- direction just needs to be consistent
    // and non-zero; the exact scale is a tuning constant.
    expect(delta).not.toBe(0);

    tracker.handleEvents([
      {type: 'pointerup', pointerId: 1, x: 0.5, y: 0.4},
      {type: 'pointerup', pointerId: 2, x: 0.5, y: 0.5},
    ]);
    expect(callbacks.buttonDown).not.toHaveBeenCalledWith(MOUSE_RIGHT);
  });

  it('ignores a stray move from an untracked pointer', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([{type: 'pointermove', pointerId: 9, x: 0.1, y: 0.1}]);
    expect(callbacks.moveCursor).not.toHaveBeenCalled();
  });

  it('dispose() releases a stuck-down left button but sends nothing if nothing was committed', () => {
    const callbacks = makeCallbacks();
    const tracker = new GfnTouchGestureTracker(callbacks);

    tracker.handleEvents([{type: 'pointerdown', pointerId: 1, x: 0.5, y: 0.5}]);
    jest.advanceTimersByTime(60);
    expect(callbacks.buttonDown).toHaveBeenCalledWith(MOUSE_LEFT);

    tracker.dispose();
    expect(callbacks.buttonUp).toHaveBeenCalledWith(MOUSE_LEFT);

    callbacks.buttonUp.mockClear();
    const freshTracker = new GfnTouchGestureTracker(callbacks);
    freshTracker.dispose();
    expect(callbacks.buttonUp).not.toHaveBeenCalled();
  });
});
