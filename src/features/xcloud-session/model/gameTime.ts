// Cloud gaming time is limited per month on Xbox, and the stream tells the
// client how many seconds are left (and whether the clock is running) with a
// system-UI message -- the web player turns it into a warning shortly before
// the time runs out. This is the pure part of doing the same here.

export const SYSTEM_UI_TARGET_GAME_TIME =
  '/streaming/systemUi/messages/ShowGameTimeNotification';

// The system-UI type the stream must be told the client supports before it
// sends the message above.
export const SYSTEM_UI_TYPE_GAME_TIME = 42;

// Warn this long before the time is up, in seconds (10, 5 and 1 minute).
export const GAME_TIME_WARNING_SECONDS = [600, 300, 60];

export type GameTime = {
  secondsLeft: number;
  // Whether the game's clock is running (it stops while e.g. paused).
  active: boolean;
};

// {"SecondsLeft": 1800, "IsTimerActive": true}, parsed already or as text.
export const parseGameTime = (payload: unknown): GameTime | null => {
  let data: any = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  const secondsLeft = Number(data?.SecondsLeft);
  if (!data || !Number.isFinite(secondsLeft) || secondsLeft < 0) {
    return null;
  }
  return {secondsLeft, active: data.IsTimerActive === true};
};

// Seconds left now, from the last report and when it came in.
export const secondsLeftNow = (
  report: GameTime,
  receivedAt: number,
  now: number,
): number => {
  if (!report.active) {
    return report.secondsLeft;
  }
  return Math.max(
    0,
    report.secondsLeft - Math.floor((now - receivedAt) / 1000),
  );
};

// Which warning (in minutes) is due, if any. `fired` holds the thresholds
// already warned about and is updated: a threshold fires once as the time
// drops under it; when it falls under several at once (a report that arrives
// late in the game) only the most urgent is announced; and a threshold the
// time has climbed back over (time was added) can warn again.
export const takeGameTimeWarning = (
  secondsLeft: number,
  fired: Set<number>,
): number | null => {
  fired.forEach(threshold => {
    if (secondsLeft > threshold) {
      fired.delete(threshold);
    }
  });
  if (secondsLeft <= 0) {
    return null;
  }
  const due = GAME_TIME_WARNING_SECONDS.filter(
    threshold => secondsLeft <= threshold && !fired.has(threshold),
  );
  if (due.length === 0) {
    return null;
  }
  due.forEach(threshold => fired.add(threshold));
  return Math.min(...due) / 60;
};
