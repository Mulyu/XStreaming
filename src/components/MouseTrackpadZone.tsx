import React from 'react';
import {View, PanResponder, StyleSheet} from 'react-native';
import {MOUSE_LEFT, MOUSE_RIGHT} from '../gfn/inputEncoding';

export interface MouseTrackpadRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouseTrackpadZoneProps {
  enabled: boolean;
  // Multiplier applied to the per-move finger delta (in px) before it is sent.
  sensitivity: number;
  rect: MouseTrackpadRect;
  onMove: (dx: number, dy: number) => void;
  onButtonDown: (button: number) => void;
  onButtonUp: (button: number) => void;
  onWheel: (delta: number) => void;
}

// A quick, still finger is a click; anything that moves past this (px) is a
// drag/move instead, and cancels the hold-to-drag timer below.
const MOVE_CANCEL_DISTANCE_PX = 10;
const TAP_MAX_DURATION_MS = 250;
// A finger held still this long (without ever exceeding the distance above)
// starts a click-and-drag: button down now, up on release. A finger that
// starts moving immediately never hits this -- it's just cursor movement.
const HOLD_TO_DRAG_MS = 350;

/**
 * A transparent overlay that turns touch gestures into trackpad-style mouse
 * input for GFN's mouse protocol (see gfn/inputEncoding.ts): one-finger drag
 * moves the cursor, a tap clicks, a held-then-dragged finger click-drags, a
 * two-finger tap right-clicks, and a two-finger drag scrolls -- the same
 * conventions as a laptop trackpad, since there's no physical mouse here.
 */
const MouseTrackpadZone: React.FC<MouseTrackpadZoneProps> = ({
  enabled,
  sensitivity,
  rect,
  onMove,
  onButtonDown,
  onButtonUp,
  onWheel,
}) => {
  const lastPointRef = React.useRef<{x: number; y: number} | null>(null);
  const lastTwoFingerYRef = React.useRef<number | null>(null);
  const gestureStartRef = React.useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const movedRef = React.useRef(false);
  const everTwoFingerRef = React.useRef(false);
  const leftDownRef = React.useRef(false);
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const releaseLeftIfDown = React.useCallback(() => {
    clearHoldTimer();
    if (leftDownRef.current) {
      leftDownRef.current = false;
      onButtonUp(MOUSE_LEFT);
    }
  }, [onButtonUp]);

  const resetGestureState = () => {
    lastPointRef.current = null;
    lastTwoFingerYRef.current = null;
    gestureStartRef.current = null;
    movedRef.current = false;
    everTwoFingerRef.current = false;
  };

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: () => enabled,
        onPanResponderGrant: evt => {
          const touches = evt.nativeEvent.touches;
          const primary = touches[0] ?? evt.nativeEvent;
          lastPointRef.current = {x: primary.pageX, y: primary.pageY};
          gestureStartRef.current = {
            x: primary.pageX,
            y: primary.pageY,
            time: Date.now(),
          };
          movedRef.current = false;
          everTwoFingerRef.current = touches.length >= 2;
          lastTwoFingerYRef.current =
            touches.length >= 2
              ? (touches[0].pageY + touches[1].pageY) / 2
              : null;

          clearHoldTimer();
          if (touches.length === 1) {
            holdTimerRef.current = setTimeout(() => {
              if (!movedRef.current && !leftDownRef.current) {
                leftDownRef.current = true;
                onButtonDown(MOUSE_LEFT);
              }
            }, HOLD_TO_DRAG_MS);
          }
        },
        onPanResponderMove: evt => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            everTwoFingerRef.current = true;
            clearHoldTimer();
            const avgY = (touches[0].pageY + touches[1].pageY) / 2;
            if (lastTwoFingerYRef.current !== null) {
              const dy = avgY - lastTwoFingerYRef.current;
              if (Math.abs(dy) > 0.5) {
                onWheel(dy);
                movedRef.current = true;
              }
            }
            lastTwoFingerYRef.current = avgY;
            lastPointRef.current = {x: touches[0].pageX, y: touches[0].pageY};
            return;
          }

          const primary = touches[0];
          if (!primary || !lastPointRef.current) {
            return;
          }
          const dx = primary.pageX - lastPointRef.current.x;
          const dy = primary.pageY - lastPointRef.current.y;
          lastPointRef.current = {x: primary.pageX, y: primary.pageY};

          if (!movedRef.current && gestureStartRef.current) {
            const totalDx = primary.pageX - gestureStartRef.current.x;
            const totalDy = primary.pageY - gestureStartRef.current.y;
            const dist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
            if (dist > MOVE_CANCEL_DISTANCE_PX) {
              movedRef.current = true;
              clearHoldTimer();
            }
          }

          if (dx !== 0 || dy !== 0) {
            onMove(dx * sensitivity, dy * sensitivity);
          }
        },
        onPanResponderRelease: () => {
          const start = gestureStartRef.current;
          const wasLeftDown = leftDownRef.current;
          clearHoldTimer();

          if (wasLeftDown) {
            leftDownRef.current = false;
            onButtonUp(MOUSE_LEFT);
          } else if (
            !movedRef.current &&
            start &&
            Date.now() - start.time <= TAP_MAX_DURATION_MS
          ) {
            const button = everTwoFingerRef.current ? MOUSE_RIGHT : MOUSE_LEFT;
            onButtonDown(button);
            onButtonUp(button);
          }

          resetGestureState();
        },
        onPanResponderTerminate: () => {
          releaseLeftIfDown();
          resetGestureState();
        },
      }),
    [
      enabled,
      sensitivity,
      onMove,
      onButtonDown,
      onButtonUp,
      onWheel,
      releaseLeftIfDown,
    ],
  );

  // Don't leave a button stuck down if the zone disappears mid-drag (e.g.
  // trackpad mode toggled off while dragging).
  React.useEffect(() => {
    if (!enabled) {
      releaseLeftIfDown();
      resetGestureState();
    }
  }, [enabled, releaseLeftIfDown]);
  React.useEffect(() => () => releaseLeftIfDown(), [releaseLeftIfDown]);

  if (!enabled) {
    return null;
  }

  return (
    <View
      style={[
        styles.zone,
        {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        },
      ]}
      {...responder.panHandlers}
    />
  );
};

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    zIndex: 1,
  },
});

export default MouseTrackpadZone;
