// Nexus + D-pad = touchpad swipe, for controllers and on-screen layouts that
// have no touchpad of their own. Works on the merged gpState (virtual
// gamepad, physical controller and keyboard all land there), once per input
// tick:
//
// - Hold Nexus and press (or hold) a D-pad direction: a finger swipes across
//   the touchpad that way. Held, it repeats like a scroll. While Nexus is
//   held the D-pad is not sent as a D-pad.
// - Tap Nexus alone: a touchpad click (a short pulse, sent on release so a
//   Nexus + D-pad swipe doesn't also click).

export type ComboTouch = {id: number; x: number; y: number};

const SWIPE_MS = 140;
// Finger-up time between repeated swipes, so each one reads as its own.
const SWIPE_GAP_MS = 110;
const CLICK_PULSE_MS = 100;
// Synthetic ids live in their own range, away from the on-screen pad's.
const ID_BASE = 64;
const ID_COUNT = 64;

type Direction = 'Up' | 'Down' | 'Left' | 'Right';
const DIRECTIONS: Direction[] = ['Up', 'Down', 'Left', 'Right'];

// Finger path across the pad (normalized, y down), moving the way the D-pad
// points.
const PATHS: Record<Direction, {from: [number, number]; to: [number, number]}> =
  {
    Up: {from: [0.5, 0.8], to: [0.5, 0.2]},
    Down: {from: [0.5, 0.2], to: [0.5, 0.8]},
    Left: {from: [0.8, 0.5], to: [0.2, 0.5]},
    Right: {from: [0.2, 0.5], to: [0.8, 0.5]},
  };

export type NexusTouchpadCombo = {
  /** Returns gp with the combo applied (a copy; gp itself is untouched). */
  apply: (gp: any, now: number) => any;
};

export const createNexusTouchpadCombo = (): NexusTouchpadCombo => {
  let nexusHeld = false;
  let swipedDuringHold = false;
  let swipe: {dir: Direction; startAt: number; id: number} | null = null;
  let nextSwipeAt = 0;
  let clickUntil = 0;
  let nextId = 0;
  // Directions already used for a swipe that haven't been released since;
  // they must not leak out as D-pad presses once Nexus lets go.
  const consumed = new Set<Direction>();

  return {
    apply: (gp, now) => {
      const nexus = !!gp?.Nexus;
      const held = DIRECTIONS.filter(d => !!gp?.[`DPad${d}`]);

      if (nexus && !nexusHeld) {
        nexusHeld = true;
        swipedDuringHold = false;
      } else if (!nexus && nexusHeld) {
        nexusHeld = false;
        if (!swipedDuringHold) {
          clickUntil = now + CLICK_PULSE_MS;
        }
      }

      if (swipe && now >= swipe.startAt + SWIPE_MS) {
        swipe = null;
        nextSwipeAt = now + SWIPE_GAP_MS;
      }
      if (!swipe && nexusHeld && held.length > 0 && now >= nextSwipeAt) {
        const dir = held[0];
        swipe = {dir, startAt: now, id: ID_BASE + (nextId++ % ID_COUNT)};
        swipedDuringHold = true;
        consumed.add(dir);
      }
      DIRECTIONS.forEach(d => {
        if (!held.includes(d)) {
          consumed.delete(d);
        }
      });

      const out: any = {...gp};
      DIRECTIONS.forEach(d => {
        if (nexusHeld || consumed.has(d)) {
          out[`DPad${d}`] = 0;
        }
      });
      out.Nexus = now < clickUntil ? 1 : 0;

      const realTouches: ComboTouch[] = Array.isArray(gp?.Touches)
        ? gp.Touches
        : [];
      if (swipe && realTouches.length === 0) {
        const {from, to} = PATHS[swipe.dir];
        const t = Math.min(1, (now - swipe.startAt) / SWIPE_MS);
        out.Touches = [
          {
            id: swipe.id,
            x: from[0] + (to[0] - from[0]) * t,
            y: from[1] + (to[1] - from[1]) * t,
          },
        ];
      }
      return out;
    },
  };
};
