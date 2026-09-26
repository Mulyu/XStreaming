import {MOUSE_LEFT, MOUSE_RIGHT} from '../../../entities/gfn-input';

export type GfnPointerEventType = 'pointerdown' | 'pointermove' | 'pointerup';

export type GfnPointerEvent = {
  type: GfnPointerEventType;
  pointerId: number;
  x: number;
  y: number;
};

export type GfnTouchGestureCallbacks = {
  moveCursor: (x: number, y: number, warp: boolean) => void;
  buttonDown: (button: number) => void;
  buttonUp: (button: number) => void;
  wheel: (delta: number) => void;
};

// NativeTouchOverlay hands us x/y already normalized to 0..1 of the video
// viewport (see components/NativeTouchOverlay.tsx), not raw pixels, and
// there's no pixel height available down here to convert with -- so a
// two-finger vertical drag's normalized delta is scaled by this constant (as
// if the viewport were this many px tall) to land in roughly the same range
// as MouseTrackpadZone's own pixel-delta wheel values. A tuning constant, not
// a measured one; adjust if on-device scrolling feels too fast/slow.
const NORMALIZED_WHEEL_SCALE = 1200;

// A vertical two-finger drag smaller than this (in the scaled units above) is
// noise/hand tremor, not a scroll -- mirrors MouseTrackpadZone's 0.5px-ish
// threshold, just in this module's own units.
const SCROLL_MOVE_THRESHOLD = 1.5;

// How long a single finger's touch-down waits before committing to a
// click+cursor-warp. A second finger landing inside this window instead
// turns the gesture into a two-finger one (right-click / scroll) with the
// first finger's click suppressed entirely -- short enough that a deliberate
// single tap/drag never feels delayed, long enough to catch two fingers
// landing "together" in practice.
const TWO_FINGER_WINDOW_MS = 60;

type PointerPos = {x: number; y: number};

/**
 * Reconstructs trackpad-style two-finger gestures (right-click, scroll,
 * right-drag) on top of GFN's absolute-touch input path, which -- unlike
 * MouseTrackpadZone's relative mode -- only ever has one finger's worth of
 * cursor position to work with (see GfnStreamAdapter.queuePointerInput /
 * NVST's absolute mouse message). Every gesture here is therefore anchored to
 * a single "primary" finger -- whichever one touched down first -- since with
 * absolute touch there's no principled way to pick a position out of two
 * simultaneously-down fingers: the primary's own touch point is where the
 * cursor visibly is, so it's the only candidate that doesn't feel arbitrary.
 * A second finger never contributes a coordinate of its own; it's purely a
 * modifier that switches which mouse button the primary's press/drag uses.
 * NativeTouchOverlay already reports every finger's own pointerdown/move/up
 * individually rather than batched, so this tracks currently-down pointers
 * across calls the same way MouseTrackpadZone reads React Native's touches
 * array, just event-by-event instead of all at once.
 */
export class GfnTouchGestureTracker {
  private readonly callbacks: GfnTouchGestureCallbacks;
  private order: number[] = [];
  private readonly positions = new Map<number, PointerPos>();
  private primaryId: number | null = null;
  private primaryCommitted = false;
  private primaryTimer: ReturnType<typeof setTimeout> | null = null;
  // Which button the primary finger's press/drag currently holds. Starts
  // (and normally stays) MOUSE_LEFT; switches to MOUSE_RIGHT for as long as
  // `modifierId` below is down.
  private activeButton: number = MOUSE_LEFT;
  // A second finger that landed *after* the primary already committed (i.e.
  // well after the two-finger window below, not landing "together" with it).
  // It carries no coordinate of its own -- see the class doc -- it just
  // toggles `activeButton` between left and right for as long as it's held.
  private modifierId: number | null = null;
  private twoFinger = false;
  private twoFingerIds: [number, number] | null = null;
  private twoFingerMoved = false;
  private lastTwoFingerAvgY: number | null = null;
  // The first (primary) finger's last known position while a near-simultaneous
  // two-finger gesture is active -- see onUp's use of it below for why this is
  // tracked separately from `positions`, which loses it once that finger lifts.
  private twoFingerPrimaryPos: PointerPos | null = null;

  constructor(callbacks: GfnTouchGestureCallbacks) {
    this.callbacks = callbacks;
  }

  handleEvents(events: GfnPointerEvent[] | undefined | null): void {
    events?.forEach(event => event && this.handleEvent(event));
  }

  private handleEvent(event: GfnPointerEvent): void {
    if (event.type === 'pointerdown') {
      this.onDown(event);
    } else if (event.type === 'pointermove') {
      this.onMove(event);
    } else if (event.type === 'pointerup') {
      this.onUp(event);
    }
  }

  private onDown(event: GfnPointerEvent): void {
    this.positions.set(event.pointerId, {x: event.x, y: event.y});
    this.order.push(event.pointerId);

    if (this.order.length === 1) {
      this.primaryId = event.pointerId;
      this.primaryCommitted = false;
      this.activeButton = MOUSE_LEFT;
      this.primaryTimer = setTimeout(
        () => this.commitPrimary(),
        TWO_FINGER_WINDOW_MS,
      );
      return;
    }

    if (this.order.length === 2 && !this.primaryCommitted) {
      // Second finger joined before the first committed -- fingers landing
      // "together", handled as the near-simultaneous two-finger gesture
      // (scroll or tap-to-right-click) below. Cancel the pending commit so
      // the primary never warps the cursor or presses the left button at all.
      if (this.primaryTimer) {
        clearTimeout(this.primaryTimer);
        this.primaryTimer = null;
      }
      this.twoFinger = true;
      this.twoFingerIds = [this.order[0], this.order[1]];
      this.twoFingerMoved = false;
      this.lastTwoFingerAvgY = this.averageTwoFingerY();
      this.twoFingerPrimaryPos =
        this.positions.get(this.twoFingerIds[0]) ?? null;
      return;
    }

    if (
      this.order.length === 2 &&
      this.primaryCommitted &&
      this.modifierId === null
    ) {
      // A second finger joining well after the primary already committed --
      // not "together" with it, so this is the right-button modifier instead
      // (see the class doc): switch the primary's held button without
      // touching its position at all.
      this.modifierId = event.pointerId;
      this.callbacks.buttonUp(this.activeButton);
      this.activeButton = MOUSE_RIGHT;
      this.callbacks.buttonDown(this.activeButton);
      return;
    }

    // A third+ finger, or a second finger joining while a two-finger/modifier
    // gesture is already active -- out of scope, left untouched.
  }

  private onMove(event: GfnPointerEvent): void {
    if (!this.positions.has(event.pointerId)) {
      return;
    }
    this.positions.set(event.pointerId, {x: event.x, y: event.y});

    if (this.twoFinger && this.twoFingerIds?.includes(event.pointerId)) {
      if (event.pointerId === this.twoFingerIds[0]) {
        this.twoFingerPrimaryPos = {x: event.x, y: event.y};
      }
      const avgY = this.averageTwoFingerY();
      if (avgY !== null && this.lastTwoFingerAvgY !== null) {
        const delta = (avgY - this.lastTwoFingerAvgY) * NORMALIZED_WHEEL_SCALE;
        if (Math.abs(delta) > SCROLL_MOVE_THRESHOLD) {
          this.callbacks.wheel(delta);
          this.twoFingerMoved = true;
        }
      }
      this.lastTwoFingerAvgY = avgY;
      return;
    }

    // Pre-commit moves of the primary finger aren't sent individually -- the
    // eventual commit (timer or the fast-tap path in onUp) reads whatever
    // position is on record at that moment, so a quick pre-commit drag still
    // lands in the right place without needing its own cursor-move calls.
    if (event.pointerId === this.primaryId && this.primaryCommitted) {
      this.callbacks.moveCursor(event.x, event.y, false);
    }
  }

  private onUp(event: GfnPointerEvent): void {
    const wasPrimary = event.pointerId === this.primaryId;
    const wasModifier = event.pointerId === this.modifierId;
    const wasTwoFingerPointer = !!this.twoFingerIds?.includes(event.pointerId);

    if (this.twoFingerIds && event.pointerId === this.twoFingerIds[0]) {
      this.twoFingerPrimaryPos = {x: event.x, y: event.y};
    }

    this.positions.delete(event.pointerId);
    this.order = this.order.filter(id => id !== event.pointerId);

    if (wasModifier) {
      // The modifier finger lifted before the primary -- revert to the left
      // button so the primary (still down) keeps working as an ordinary drag.
      this.releaseModifier();
    }

    if (wasPrimary) {
      if (this.primaryTimer) {
        // Lifted before the two-finger window elapsed and no second finger
        // joined -- a fast tap. Commit it now (at the up position, since the
        // position map entry was just deleted above) so a quick tap still
        // clicks instead of silently vanishing into an unresolved wait.
        clearTimeout(this.primaryTimer);
        this.primaryTimer = null;
        this.commitPrimary({x: event.x, y: event.y});
      }
      if (this.primaryCommitted) {
        this.callbacks.moveCursor(event.x, event.y, true);
        this.callbacks.buttonUp(this.activeButton);
      }
      // A modifier finger still down at this point is orphaned -- clearing
      // modifierId here (without the revert dance releaseModifier does) means
      // its own eventual pointerup just falls through as a no-op.
      this.primaryId = null;
      this.primaryCommitted = false;
      this.modifierId = null;
      this.activeButton = MOUSE_LEFT;
    }

    if (wasTwoFingerPointer) {
      const otherStillDown = this.twoFingerIds?.some(
        id => id !== event.pointerId && this.positions.has(id),
      );
      if (!otherStillDown) {
        if (this.twoFinger && !this.twoFingerMoved) {
          // Two fingers landed and lifted together without ever scrolling --
          // a right-click, warped to the primary (first) finger's position so
          // it lands where the touch visibly was rather than wherever the
          // cursor happened to be already.
          if (this.twoFingerPrimaryPos) {
            this.callbacks.moveCursor(
              this.twoFingerPrimaryPos.x,
              this.twoFingerPrimaryPos.y,
              true,
            );
          }
          this.callbacks.buttonDown(MOUSE_RIGHT);
          this.callbacks.buttonUp(MOUSE_RIGHT);
        }
        this.twoFinger = false;
        this.twoFingerIds = null;
        this.twoFingerMoved = false;
        this.lastTwoFingerAvgY = null;
        this.twoFingerPrimaryPos = null;
      }
    }

    if (this.order.length === 0) {
      this.reset();
    }
  }

  // The modifier finger lifted (while the primary is still down): switch back
  // to the left button so the primary keeps working as an ordinary drag,
  // rather than ending the gesture -- a second tap of the modifier finger can
  // re-engage the right button again for as long as the primary stays down.
  private releaseModifier(): void {
    if (this.modifierId === null) {
      return;
    }
    this.modifierId = null;
    if (this.primaryId !== null && this.primaryCommitted) {
      this.callbacks.buttonUp(this.activeButton);
      this.activeButton = MOUSE_LEFT;
      this.callbacks.buttonDown(this.activeButton);
    }
  }

  // `pos` is passed explicitly by the fast-tap path in onUp, which needs to
  // commit using the just-received up position after already deleting it
  // from `positions`; the timer-driven path has no such event to read from,
  // so it falls back to whatever position onMove last recorded.
  private commitPrimary(pos?: PointerPos): void {
    this.primaryTimer = null;
    if (this.primaryId === null || this.twoFinger) {
      return;
    }
    const position = pos ?? this.positions.get(this.primaryId);
    if (!position) {
      return;
    }
    this.primaryCommitted = true;
    this.callbacks.moveCursor(position.x, position.y, true);
    this.callbacks.buttonDown(this.activeButton);
  }

  private averageTwoFingerY(): number | null {
    if (!this.twoFingerIds) {
      return null;
    }
    const a = this.positions.get(this.twoFingerIds[0]);
    const b = this.positions.get(this.twoFingerIds[1]);
    return a && b ? (a.y + b.y) / 2 : null;
  }

  private reset(): void {
    if (this.primaryTimer) {
      clearTimeout(this.primaryTimer);
    }
    this.order = [];
    this.positions.clear();
    this.primaryId = null;
    this.primaryCommitted = false;
    this.primaryTimer = null;
    this.activeButton = MOUSE_LEFT;
    this.modifierId = null;
    this.twoFinger = false;
    this.twoFingerIds = null;
    this.twoFingerMoved = false;
    this.lastTwoFingerAvgY = null;
    this.twoFingerPrimaryPos = null;
  }

  // Clears any pending timer/state without warping the cursor -- for when the
  // overlay itself goes away mid-gesture (native-touch mode toggled off, or
  // the stream ending). Still releases a committed button (left or right,
  // whichever is currently held) so it can't get stuck down on the server side.
  dispose(): void {
    if (this.primaryCommitted) {
      this.callbacks.buttonUp(this.activeButton);
    }
    this.reset();
  }
}
