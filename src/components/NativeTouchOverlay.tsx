import React from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeTouchEvent,
  StyleSheet,
  View,
} from 'react-native';
import type {PointerWireData} from '../features/xcloud-session';

const STREAM_ASPECT_RATIO = 16 / 9;

type VideoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScreenPosition = 'top' | 'center' | 'bottom';

type NativeTouchOverlayProps = {
  enabled: boolean;
  videoFormat?: string;
  screenPosition?: ScreenPosition;
  onPointerInput?: (event: PointerWireData) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// A "W:H" video format string (16:10, 18:9, 20:9, 21:9, 4:3, ...) -- anything
// that doesn't parse falls back to the 16:9 stream aspect assumption below.
const parseFixedAspectRatio = (format: string): number | null => {
  const [w, h] = format.split(':').map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? w / h
    : null;
};

// Mirrors WebRTCView's native layout exactly (see the screenPosition patch on
// react-native-webrtc): Stretch and Zoom both fill the given bounds exactly
// (Zoom crops inside that rect on the native side rather than the ViewGroup
// leaving letterboxing space to offset), everything else is letterboxed at
// the requested aspect ratio and anchored per screenPosition -- top pins the
// video to y=0, bottom pins it to the far edge, center (the default) splits
// the leftover space evenly. Getting this wrong is exactly why touches
// landed in the wrong place whenever screen position was top or bottom.
const resolveVideoRect = (
  width: number,
  height: number,
  videoFormat?: string,
  screenPosition: ScreenPosition = 'center',
): VideoRect => {
  if (width <= 0 || height <= 0) {
    return {x: 0, y: 0, width: 1, height: 1};
  }

  const format = videoFormat ?? '';
  if (format === 'Stretch' || format === 'Zoom') {
    return {x: 0, y: 0, width, height};
  }

  const aspect = parseFixedAspectRatio(format) ?? STREAM_ASPECT_RATIO;
  const containerAspect = width / height;

  const fittedWidth = containerAspect > aspect ? height * aspect : width;
  const fittedHeight = containerAspect > aspect ? height : width / aspect;

  const verticalSpace = height - fittedHeight;
  const y =
    screenPosition === 'top'
      ? 0
      : screenPosition === 'bottom'
      ? verticalSpace
      : verticalSpace / 2;

  return {
    x: (width - fittedWidth) / 2,
    y,
    width: fittedWidth,
    height: fittedHeight,
  };
};

const NativeTouchOverlay = ({
  enabled,
  videoFormat,
  screenPosition,
  onPointerInput,
}: NativeTouchOverlayProps) => {
  const [layout, setLayout] = React.useState({width: 0, height: 0});
  const activePointersRef = React.useRef(new Set<number>());

  React.useEffect(() => {
    if (!enabled) {
      activePointersRef.current.clear();
    }
  }, [enabled]);

  const videoRect = React.useMemo(
    () =>
      resolveVideoRect(
        layout.width,
        layout.height,
        videoFormat,
        screenPosition,
      ),
    [layout.height, layout.width, videoFormat, screenPosition],
  );

  const buildPointerEvent = React.useCallback(
    (
      touch: NativeTouchEvent,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
    ): PointerWireData | null => {
      if (!enabled || !onPointerInput) {
        return null;
      }

      const pointerId = Math.max(0, Math.floor(Number(touch.identifier ?? 0)));
      const localX = Number(touch.locationX ?? 0);
      const localY = Number(touch.locationY ?? 0);

      const clampedX = clamp(
        localX,
        videoRect.x,
        videoRect.x + videoRect.width,
      );
      const clampedY = clamp(
        localY,
        videoRect.y,
        videoRect.y + videoRect.height,
      );

      const normalizedX = clamp(
        (clampedX - videoRect.x) / Math.max(1, videoRect.width),
        0,
        1,
      );
      const normalizedY = clamp(
        (clampedY - videoRect.y) / Math.max(1, videoRect.height),
        0,
        1,
      );

      const isInside =
        localX >= videoRect.x &&
        localX <= videoRect.x + videoRect.width &&
        localY >= videoRect.y &&
        localY <= videoRect.y + videoRect.height;

      if (type === 'pointerdown' && !isInside) {
        return null;
      }

      const touchAny = touch as any;
      const rawWidth = Number(touchAny.radiusX || 0) * 2;
      const rawHeight = Number(touchAny.radiusY || 0) * 2;
      const fallbackDiameter =
        1 / Math.max(1, Math.max(videoRect.width, videoRect.height));

      const width = clamp(
        rawWidth > 0
          ? rawWidth / Math.max(1, videoRect.width)
          : fallbackDiameter,
        0,
        1,
      );
      const height = clamp(
        rawHeight > 0
          ? rawHeight / Math.max(1, videoRect.height)
          : fallbackDiameter,
        0,
        1,
      );

      const pressure =
        typeof touch.force === 'number' && touch.force > 0
          ? clamp(touch.force, 0, 1)
          : type === 'pointerup'
          ? 0
          : 1;

      return {
        height,
        pressure,
        twist: 0,
        width,
        pointerId,
        x: normalizedX,
        y: normalizedY,
        type,
        clientHeight: 1,
        clientWidth: 1,
      };
    },
    [enabled, onPointerInput, videoRect],
  );

  const emitChangedTouches = React.useCallback(
    (
      event: GestureResponderEvent,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
    ) => {
      if (!enabled || !onPointerInput) {
        return;
      }

      const changedTouches =
        (event.nativeEvent.changedTouches as Array<NativeTouchEvent>) || [];

      for (const touch of changedTouches) {
        const pointerId = Math.max(
          0,
          Math.floor(Number(touch.identifier ?? 0)),
        );
        const isActive = activePointersRef.current.has(pointerId);

        if (type === 'pointerdown') {
          const pointerEvent = buildPointerEvent(touch, 'pointerdown');
          if (!pointerEvent) {
            continue;
          }
          activePointersRef.current.add(pointerId);
          onPointerInput(pointerEvent);
          continue;
        }

        if (!isActive) {
          continue;
        }

        const pointerEvent = buildPointerEvent(touch, type);
        if (pointerEvent) {
          onPointerInput(pointerEvent);
        }

        if (type === 'pointerup') {
          activePointersRef.current.delete(pointerId);
        }
      }
    },
    [buildPointerEvent, enabled, onPointerInput],
  );

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setLayout({width, height});
  }, []);

  const onTouchStart = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointerdown');
    },
    [emitChangedTouches],
  );

  const onTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointermove');
    },
    [emitChangedTouches],
  );

  const onTouchEnd = React.useCallback(
    (event: GestureResponderEvent) => {
      emitChangedTouches(event, 'pointerup');
    },
    [emitChangedTouches],
  );

  return (
    <View
      style={styles.overlay}
      pointerEvents={enabled ? 'auto' : 'none'}
      onLayout={onLayout}
      onStartShouldSetResponder={() => enabled}
      onMoveShouldSetResponder={() => enabled}
      onResponderTerminationRequest={() => false}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default NativeTouchOverlay;
