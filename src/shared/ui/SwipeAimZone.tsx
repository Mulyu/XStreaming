import React from 'react';
import {requireNativeComponent, StyleSheet, ViewProps} from 'react-native';

export interface SwipeAimRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type NativeSwipeAimMoveEvent = {
  nativeEvent: {dx: number; dy: number};
};

type NativeSwipeAimViewProps = ViewProps & {
  onSwipeAimMove?: (event: NativeSwipeAimMoveEvent) => void;
  onSwipeAimEnd?: () => void;
};

// See SwipeAimView.java's own comment for why this is a plain native View
// (hosting its own onTouchEvent, like ButtonView/AnalogStickView) rather
// than a react-native-gesture-handler GestureDetector, which this used to
// be: a finger tracked by a Gesture.Pan() here could keep ButtonViews
// elsewhere on screen from getting their own touches for as long as a
// swipe was in progress, since gesture-handler's touch delivery and plain
// Android Views' touch delivery don't fully coexist on Android. A plain
// View gets Android's own default per-pointer motion-event splitting
// across sibling views for free, the same mechanism that already lets a
// ButtonView and an AnalogStickView each take their own finger
// simultaneously.
const NativeSwipeAimView =
  requireNativeComponent<NativeSwipeAimViewProps>('SwipeAimView');

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
  // Whether the zone should actually apply a move right now (e.g. an
  // activation scheme like "only while the left trigger is held"). Checked
  // live on every reported move, not memoized, so a trigger release is
  // picked up immediately rather than waiting for a re-render. The touch
  // itself is still claimed either way (this view always owns whatever
  // finger starts inside its own bounds, same as a ButtonView would) --
  // this only gates whether that finger's movement is actually forwarded
  // as aim input. Omit to always report moves whenever enabled.
  isActive?: () => boolean;
}

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
  if (!enabled) {
    return null;
  }

  const handleMove = (event: NativeSwipeAimMoveEvent) => {
    if (isActive && !isActive()) {
      return;
    }
    const {dx, dy} = event.nativeEvent;
    // Boost grows with how far the finger moved this one event (a proxy
    // for swipe speed): a slow drag has boost ~= 1 (acceleration barely
    // contributes), a fast flick's larger per-event distance multiplies
    // it up sharply.
    const boost = acceleration > 0 ? 1 + acceleration * Math.hypot(dx, dy) : 1;
    onAim(dx * sensitivity * boost, dy * sensitivity * boost);
  };

  return (
    <NativeSwipeAimView
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
      onSwipeAimMove={handleMove}
      onSwipeAimEnd={onEnd}
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
