import {parseGameTime, secondsLeftNow, takeGameTimeWarning} from '../gameTime';

describe('parseGameTime', () => {
  it('reads the stream message, as text or already parsed', () => {
    const text = '{"SecondsLeft":1800,"IsTimerActive":true}';
    expect(parseGameTime(text)).toEqual({secondsLeft: 1800, active: true});
    expect(parseGameTime(JSON.parse(text))).toEqual({
      secondsLeft: 1800,
      active: true,
    });
  });

  it('treats a missing or false flag as a stopped clock', () => {
    expect(parseGameTime({SecondsLeft: 60})?.active).toBe(false);
    expect(parseGameTime({SecondsLeft: 60, IsTimerActive: false})?.active).toBe(
      false,
    );
  });

  it('rejects anything that is not a time', () => {
    expect(parseGameTime('nope')).toBeNull();
    expect(parseGameTime(null)).toBeNull();
    expect(parseGameTime({})).toBeNull();
    expect(parseGameTime({SecondsLeft: -5})).toBeNull();
    expect(parseGameTime({SecondsLeft: 'soon'})).toBeNull();
  });
});

describe('secondsLeftNow', () => {
  it('counts down while the clock runs and holds while it is stopped', () => {
    expect(secondsLeftNow({secondsLeft: 100, active: true}, 1000, 31500)).toBe(
      70,
    );
    expect(secondsLeftNow({secondsLeft: 100, active: false}, 1000, 31500)).toBe(
      100,
    );
    expect(secondsLeftNow({secondsLeft: 10, active: true}, 0, 60000)).toBe(0);
  });
});

describe('takeGameTimeWarning', () => {
  it('warns once at each of 10, 5 and 1 minute', () => {
    const fired = new Set<number>();
    expect(takeGameTimeWarning(1800, fired)).toBeNull();
    expect(takeGameTimeWarning(601, fired)).toBeNull();
    expect(takeGameTimeWarning(600, fired)).toBe(10);
    expect(takeGameTimeWarning(599, fired)).toBeNull();
    expect(takeGameTimeWarning(300, fired)).toBe(5);
    expect(takeGameTimeWarning(299, fired)).toBeNull();
    expect(takeGameTimeWarning(60, fired)).toBe(1);
    expect(takeGameTimeWarning(30, fired)).toBeNull();
  });

  it('announces only the most urgent when joining late', () => {
    const fired = new Set<number>();
    expect(takeGameTimeWarning(240, fired)).toBe(5);
    // The 10-minute one is not announced afterwards either.
    expect(takeGameTimeWarning(239, fired)).toBeNull();
  });

  it('says nothing once the time is out', () => {
    expect(takeGameTimeWarning(0, new Set())).toBeNull();
  });

  it('warns again after time is added', () => {
    const fired = new Set<number>();
    expect(takeGameTimeWarning(300, fired)).toBe(5);
    expect(takeGameTimeWarning(3000, fired)).toBeNull();
    expect(takeGameTimeWarning(300, fired)).toBe(5);
  });
});
