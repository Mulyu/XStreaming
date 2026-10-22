import {
  createTouchpadClickTracker,
  TOUCHPAD_CLICK_HOLD_MS,
} from '../touchpadClick';

const setup = () => {
  const events: boolean[] = [];
  const tracker = createTouchpadClickTracker(down => events.push(down));
  return {tracker, events};
};

const at = (x: number, y: number, id = 0) => [{id, x, y}];

describe('touchpad click tracker', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('clicks after a still hold and releases when the finger lifts', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    jest.advanceTimersByTime(TOUCHPAD_CLICK_HOLD_MS + 1);
    expect(events).toEqual([true]);
    tracker.update([]);
    expect(events).toEqual([true, false]);
  });

  it('does not click on a quick tap', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    jest.advanceTimersByTime(100);
    tracker.update([]);
    jest.advanceTimersByTime(1000);
    expect(events).toEqual([]);
  });

  it('does not click when the finger swipes', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    tracker.update(at(0.7, 0.5));
    jest.advanceTimersByTime(1000);
    expect(events).toEqual([]);
  });

  it('tolerates jitter within the slop', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    tracker.update(at(0.51, 0.5));
    jest.advanceTimersByTime(TOUCHPAD_CLICK_HOLD_MS + 1);
    expect(events).toEqual([true]);
  });

  it('never clicks during a two-finger gesture', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    tracker.update([...at(0.5, 0.5), ...at(0.3, 0.3, 1)]);
    jest.advanceTimersByTime(1000);
    expect(events).toEqual([]);
  });

  it('keeps the click down while moving until every finger lifts', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    jest.advanceTimersByTime(TOUCHPAD_CLICK_HOLD_MS + 1);
    tracker.update(at(0.9, 0.9));
    expect(events).toEqual([true]);
    tracker.update([]);
    expect(events).toEqual([true, false]);
  });

  it('reset releases a held click', () => {
    const {tracker, events} = setup();
    tracker.update(at(0.5, 0.5));
    jest.advanceTimersByTime(TOUCHPAD_CLICK_HOLD_MS + 1);
    tracker.reset();
    expect(events).toEqual([true, false]);
  });
});
