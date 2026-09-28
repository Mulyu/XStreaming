import React from 'react';
import {View, PanResponder, StyleSheet} from 'react-native';

export interface SwipeAimRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SwipeAimZoneProps {
  enabled: boolean;
  // Multiplier applied to the per-move finger delta (in px) before it is
  // reported. Larger = faster camera turn for the same swipe.
  sensitivity: number;
  // Extra per-pixel-of-speed boost on top of sensitivity, so a fast flick
  // turns disproportionately faster than a slow, deliberate drag -- lets a
  // quick swipe reach full turn speed for spinning around without raising
  // sensitivity itself, which would also ruin precision at low speed. 0 (the
  // default) reports sensitivity * delta with no extra boost, unchanged.
  acceleration?: number;
  // The trackpad rectangle (play-surface pixels). Only touches inside it aim.
  rect: SwipeAimRect;
  // Reports the scaled finger delta (screen coordinates, y-down) for one move.
  onAim: (dx: number, dy: number) => void;
  // Fired when the aiming finger lifts, so the caller can recentre the stick.
  onEnd: () => void;
  // Overrides the zone's paint order. Callers that nest this inside another
  // absolutely-positioned control stack (e.g. the virtual gamepad's free
  // analog-stick catcher, which otherwise sits above and swallows every touch
  // in its half of the screen) need this higher than that catcher's own
  // zIndex so the trackpad rectangle actually receives touches that land
  // inside it.
  zIndex?: number;
  // Whether the zone should actually claim a touch right now (e.g. an
  // activation scheme like "only while the left trigger is held"). Checked
  // live at each touch, not memoized, so a trigger release is picked up
  // immediately rather than waiting for a re-render. When it declines, the
  // touch falls through to whatever this zone would otherwise sit above --
  // a button, or the free analog-stick catcher it's nested over -- instead
  // of being swallowed by an aim mode that isn't actually active right now.
  // Omit to always claim touches whenever enabled.
  isActive?: () => boolean;
}

/**
 * A transparent overlay that turns finger swipes into right-stick (camera)
 * movement, the way mobile shooters do: the camera turns by how fast you drag
 * rather than by holding a stick in a direction. It sits behind the virtual
 * buttons, so buttons layered on top still receive their own touches; only the
 * empty right side of the screen drives aiming.
 */
const SwipeAimZone: React.FC<SwipeAimZoneProps> = ({
  enabled,
  sensitivity,
  acceleration = 0,
  rect,
  onAim,
  onEnd,
  zIndex = 1,
  isActive,
}) => {
  const last = React.useRef<{x: number; y: number} | null>(null);
  // The identifier of the one finger that actually started this swipe.
  // Once more than one finger is down anywhere on screen (e.g. the other
  // hand working the free left stick), nativeEvent's top-level pageX/pageY
  // can reflect whichever touch last changed rather than ours -- so a
  // second, unrelated finger's movement must never be read as a continuation
  // of this gesture.
  const touchId = React.useRef<string | null>(null);

  const responder = React.useMemo(() => {
    const shouldCapture = () => enabled && (!isActive || isActive());
    return PanResponder.create({
      onStartShouldSetPanResponder: shouldCapture,
      onMoveShouldSetPanResponder: shouldCapture,
      onPanResponderGrant: evt => {
        const t = evt.nativeEvent;
        const touch = t.changedTouches?.[0] ?? t.touches?.[0];
        touchId.current = touch ? touch.identifier : null;
        last.current = {x: t.pageX, y: t.pageY};
      },
      onPanResponderMove: evt => {
        const t = evt.nativeEvent;
        // Find our own finger among whatever touches are currently active,
        // and ignore the event entirely if it isn't one of them -- it's some
        // other finger moving, not this swipe.
        const ownTouch = (t.touches || []).find(
          touch => touch.identifier === touchId.current,
        );
        if (touchId.current != null && !ownTouch) {
          return;
        }
        const point = ownTouch ?? t;
        if (!last.current) {
          last.current = {x: point.pageX, y: point.pageY};
          return;
        }
        const dx = point.pageX - last.current.x;
        const dy = point.pageY - last.current.y;
        last.current = {x: point.pageX, y: point.pageY};
        // Boost grows with how far the finger moved this one event (a proxy
        // for swipe speed): a slow drag has boost ~= 1 (acceleration barely
        // contributes), a fast flick's larger per-event distance multiplies
        // it up sharply.
        const boost =
          acceleration > 0 ? 1 + acceleration * Math.hypot(dx, dy) : 1;
        onAim(dx * sensitivity * boost, dy * sensitivity * boost);
      },
      onPanResponderRelease: () => {
        last.current = null;
        touchId.current = null;
        onEnd();
      },
      onPanResponderTerminate: () => {
        last.current = null;
        touchId.current = null;
        onEnd();
      },
    });
  }, [enabled, sensitivity, acceleration, onAim, onEnd, isActive]);

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
          zIndex,
        },
      ]}
      {...responder.panHandlers}
    />
  );
};

const styles = StyleSheet.create({
  zone: {
    // A rectangle placed in the layout; only touches inside it drive aiming.
    // Buttons rendered on top keep their own hit areas.
    position: 'absolute',
    zIndex: 1,
  },
});

export default SwipeAimZone;
