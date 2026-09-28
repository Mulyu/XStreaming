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
  rect,
  onAim,
  onEnd,
  zIndex = 1,
  isActive,
}) => {
  const last = React.useRef<{x: number; y: number} | null>(null);

  const responder = React.useMemo(() => {
    const shouldCapture = () => enabled && (!isActive || isActive());
    return PanResponder.create({
      onStartShouldSetPanResponder: shouldCapture,
      onMoveShouldSetPanResponder: shouldCapture,
      onPanResponderGrant: evt => {
        const t = evt.nativeEvent;
        last.current = {x: t.pageX, y: t.pageY};
      },
      onPanResponderMove: evt => {
        const t = evt.nativeEvent;
        if (!last.current) {
          last.current = {x: t.pageX, y: t.pageY};
          return;
        }
        const dx = t.pageX - last.current.x;
        const dy = t.pageY - last.current.y;
        last.current = {x: t.pageX, y: t.pageY};
        onAim(dx * sensitivity, dy * sensitivity);
      },
      onPanResponderRelease: () => {
        last.current = null;
        onEnd();
      },
      onPanResponderTerminate: () => {
        last.current = null;
        onEnd();
      },
    });
  }, [enabled, sensitivity, onAim, onEnd, isActive]);

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
