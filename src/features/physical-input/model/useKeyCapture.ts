import React from 'react';
import {DeviceEventEmitter} from 'react-native';
import {setKeyCaptureEnabled} from '../api/native';
import type {PhysicalKeyEvent} from './usePhysicalInput';

// While `enabled`, the next physical key presses (any screen) are handed to
// `onKey` instead of acting on the app -- for the screen that lets the user
// choose a key for a binding. The native side swallows them so Esc/Tab/arrows
// don't also move focus or leave the screen.
export const useKeyCapture = (
  enabled: boolean,
  onKey: (keyCode: number) => void,
): void => {
  const onKeyRef = React.useRef(onKey);
  onKeyRef.current = onKey;
  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    setKeyCaptureEnabled(true);
    const subscription = DeviceEventEmitter.addListener(
      'onPhysicalKey',
      (e: PhysicalKeyEvent) => {
        if (e.down) {
          onKeyRef.current(e.keyCode);
        }
      },
    );
    return () => {
      subscription.remove();
      setKeyCaptureEnabled(false);
    };
  }, [enabled]);
};
