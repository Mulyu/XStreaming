import React from 'react';
import {View, PanResponder, StyleSheet} from 'react-native';

export interface SwipeAimZoneProps {
  enabled: boolean;
  // Multiplier applied to the per-move finger delta (in px) before it is
  // reported. Larger = faster camera turn for the same swipe.
  sensitivity: number;
  // Reports the scaled finger delta (screen coordinates, y-down) for one move.
  onAim: (dx: number, dy: number) => void;
  // Fired when the aiming finger lifts, so the caller can recentre the stick.
  onEnd: () => void;
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
  onAim,
  onEnd,
}) => {
  const last = React.useRef<{x: number; y: number} | null>(null);

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: () => enabled,
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
      }),
    [enabled, sensitivity, onAim, onEnd],
  );

  if (!enabled) {
    return null;
  }

  return <View style={styles.zone} {...responder.panHandlers} />;
};

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    // Right portion of the screen only, so the left thumbstick / d-pad area is
    // untouched. Buttons rendered on top keep their own hit areas.
    width: '55%',
    zIndex: 1,
  },
});

export default SwipeAimZone;
