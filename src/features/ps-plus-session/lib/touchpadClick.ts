// The on-screen touchpad has no physical click, so a click is a press-and-
// hold: one finger that stays down and (nearly) still for HOLD_MS presses
// the touchpad button until every finger lifts. Quick taps and swipes stay
// plain touches, as on a real DualSense where only a firm press clicks.

export type TouchpadTouch = {id: number; x: number; y: number};

export const TOUCHPAD_CLICK_HOLD_MS = 450;
// Movement (as a fraction of the pad) that turns a hold into a swipe.
export const TOUCHPAD_CLICK_SLOP = 0.04;

export type TouchpadClickTracker = {
  update: (touches: TouchpadTouch[]) => void;
  reset: () => void;
};

export const createTouchpadClickTracker = (
  onClick: (down: boolean) => void,
  holdMs = TOUCHPAD_CLICK_HOLD_MS,
): TouchpadClickTracker => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let candidate: TouchpadTouch | null = null;
  let clicking = false;

  const cancelTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const release = () => {
    cancelTimer();
    candidate = null;
    if (clicking) {
      clicking = false;
      onClick(false);
    }
  };

  return {
    update: touches => {
      if (touches.length === 0) {
        release();
        return;
      }
      if (clicking) {
        // Stays down until every finger lifts, however it moves.
        return;
      }
      if (touches.length > 1) {
        // A two-finger gesture is never a click.
        cancelTimer();
        candidate = null;
        return;
      }
      const touch = touches[0];
      if (!candidate || candidate.id !== touch.id) {
        candidate = {...touch};
        cancelTimer();
        timer = setTimeout(() => {
          timer = undefined;
          clicking = true;
          onClick(true);
        }, holdMs);
        return;
      }
      if (
        timer &&
        Math.hypot(touch.x - candidate.x, touch.y - candidate.y) >
          TOUCHPAD_CLICK_SLOP
      ) {
        cancelTimer();
      }
    },
    reset: release,
  };
};
