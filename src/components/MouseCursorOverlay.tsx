import React from 'react';
import {Animated, StyleSheet} from 'react-native';

export interface MouseCursorOverlayHandle {
  moveBy: (dx: number, dy: number) => void;
  reset: () => void;
}

export interface MouseCursorOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MouseCursorOverlayProps {
  visible: boolean;
  rect: MouseCursorOverlayRect;
}

const CURSOR_SIZE = 22;

// A locally-tracked cursor dot -- not synced with GFN's real server-side
// cursor position/shape (that needs the server's own cursor-image channel,
// which isn't implemented here). It just accumulates the same deltas sent to
// the server, clamped to the trackpad area, so there's *some* visual
// feedback for where a relative-mouse-move gesture has moved to.
const MouseCursorOverlay = React.forwardRef<
  MouseCursorOverlayHandle,
  MouseCursorOverlayProps
>(({visible, rect}, ref) => {
  const posRef = React.useRef(
    new Animated.ValueXY({x: rect.width / 2, y: rect.height / 2}),
  );
  const xyRef = React.useRef({x: rect.width / 2, y: rect.height / 2});

  React.useEffect(() => {
    // Re-center when the trackpad area actually changes size (e.g. rotation).
    xyRef.current = {x: rect.width / 2, y: rect.height / 2};
    posRef.current.setValue(xyRef.current);
  }, [rect.width, rect.height]);

  React.useImperativeHandle(
    ref,
    () => ({
      moveBy: (dx: number, dy: number) => {
        const next = {
          x: Math.max(0, Math.min(rect.width, xyRef.current.x + dx)),
          y: Math.max(0, Math.min(rect.height, xyRef.current.y + dy)),
        };
        xyRef.current = next;
        posRef.current.setValue(next);
      },
      reset: () => {
        const next = {x: rect.width / 2, y: rect.height / 2};
        xyRef.current = next;
        posRef.current.setValue(next);
      },
    }),
    [rect.width, rect.height],
  );

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cursor,
        {
          left: rect.x,
          top: rect.y,
          transform: posRef.current.getTranslateTransform(),
        },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  cursor: {
    position: 'absolute',
    width: CURSOR_SIZE,
    height: CURSOR_SIZE,
    marginLeft: -CURSOR_SIZE / 2,
    marginTop: -CURSOR_SIZE / 2,
    borderRadius: CURSOR_SIZE / 2,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.22)',
    zIndex: 2,
  },
});

export default MouseCursorOverlay;
