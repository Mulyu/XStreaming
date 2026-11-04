import React from 'react';
import {
  GameTime,
  parseGameTime,
  secondsLeftNow,
  takeGameTimeWarning,
} from './gameTime';

// How long a warning stays on screen.
const WARNING_VISIBLE_MS = 8000;

// Follows the stream's reports of the cloud gaming time left and raises a
// warning (in minutes) shortly before it runs out. `onGameTime` takes a
// report's payload; `warningMinutes` is the warning to show, null otherwise.
export const useGameTimeWarnings = () => {
  const [warningMinutes, setWarningMinutes] = React.useState<number | null>(
    null,
  );
  const reportRef = React.useRef<{report: GameTime; at: number} | null>(null);
  const firedRef = React.useRef(new Set<number>());
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = React.useCallback(() => {
    const current = reportRef.current;
    if (!current || !current.report.active) {
      return;
    }
    const minutes = takeGameTimeWarning(
      secondsLeftNow(current.report, current.at, Date.now()),
      firedRef.current,
    );
    if (minutes === null) {
      return;
    }
    setWarningMinutes(minutes);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(
      () => setWarningMinutes(null),
      WARNING_VISIBLE_MS,
    );
  }, []);

  const onGameTime = React.useCallback(
    (payload: unknown) => {
      const report = parseGameTime(payload);
      if (!report) {
        return;
      }
      reportRef.current = {report, at: Date.now()};
      check();
    },
    [check],
  );

  // The stream reports now and then, not every second, so count down between
  // reports.
  React.useEffect(() => {
    const timer = setInterval(check, 1000);
    return () => {
      clearInterval(timer);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [check]);

  return {warningMinutes, onGameTime};
};
