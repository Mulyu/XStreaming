import React from 'react';
import {DeviceEventEmitter} from 'react-native';
import {setPhysicalInputEnabled} from '../api/native';

// Raw Android key event, as forwarded by PhysicalInput.java. keyCode is an
// Android KeyEvent.KEYCODE_*, metaState a KeyEvent.getMetaState() bitmask.
export type PhysicalKeyEvent = {
  keyCode: number;
  scanCode: number;
  down: boolean;
  metaState: number;
};

// DOM MouseEvent.button numbering: 0 left, 1 middle, 2 right, 3 back,
// 4 forward.
export type PhysicalMouseButton = 0 | 1 | 2 | 3 | 4;

export type PhysicalInputHandlers = {
  onKey?: (event: PhysicalKeyEvent) => void;
  // Relative motion in device pixels.
  onMouseMove?: (dx: number, dy: number) => void;
  onMouseButton?: (button: PhysicalMouseButton, down: boolean) => void;
  // Scroll in wheel notches (positive = up / right).
  onMouseWheel?: (x: number, y: number) => void;
  // Ctrl+Alt+Shift+M -- the keyboard/mouse way to open the stream menu.
  onMenu?: () => void;
};

// Subscribes a stream screen to physical keyboard and mouse input while
// `enabled`. Handlers are read through a ref, so changing them never
// re-subscribes. Disabling (or unmounting) turns the native bridge off, which
// also releases every held key/button so nothing stays stuck down.
export const usePhysicalInput = (
  enabled: boolean,
  handlers: PhysicalInputHandlers,
): void => {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    setPhysicalInputEnabled(true);
    const subscriptions = [
      DeviceEventEmitter.addListener('onPhysicalKey', (e: PhysicalKeyEvent) =>
        handlersRef.current.onKey?.(e),
      ),
      DeviceEventEmitter.addListener(
        'onPhysicalMouseMove',
        (e: {dx: number; dy: number}) =>
          handlersRef.current.onMouseMove?.(e.dx, e.dy),
      ),
      DeviceEventEmitter.addListener(
        'onPhysicalMouseButton',
        (e: {button: PhysicalMouseButton; down: boolean}) =>
          handlersRef.current.onMouseButton?.(e.button, e.down),
      ),
      DeviceEventEmitter.addListener(
        'onPhysicalMouseWheel',
        (e: {x: number; y: number}) =>
          handlersRef.current.onMouseWheel?.(e.x, e.y),
      ),
      DeviceEventEmitter.addListener('onPhysicalMenu', () =>
        handlersRef.current.onMenu?.(),
      ),
    ];
    return () => {
      subscriptions.forEach(s => s.remove());
      setPhysicalInputEnabled(false);
    };
  }, [enabled]);
};
