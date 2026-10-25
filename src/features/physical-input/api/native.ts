import {NativeModules} from 'react-native';

const PhysicalInputNative = NativeModules.PhysicalInput;

// Turns the native physical keyboard/mouse bridge on or off (see
// android/.../PhysicalInput.java). While on and a stream is the current
// screen, the native side claims keyboard events and captures the mouse.
export const setPhysicalInputEnabled = (enabled: boolean): void => {
  PhysicalInputNative?.setEnabled?.(enabled);
};

// Key-capture mode: while on, physical keyboard keys are reported to JS
// (as onPhysicalKey) and swallowed, on any screen -- see
// PhysicalInput.setKeyCapture.
export const setKeyCaptureEnabled = (enabled: boolean): void => {
  PhysicalInputNative?.setKeyCapture?.(enabled);
};
