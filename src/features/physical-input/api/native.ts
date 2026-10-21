import {NativeModules} from 'react-native';

const PhysicalInputNative = NativeModules.PhysicalInput;

// Turns the native physical keyboard/mouse bridge on or off (see
// android/.../PhysicalInput.java). While on and a stream is the current
// screen, the native side claims keyboard events and captures the mouse.
export const setPhysicalInputEnabled = (enabled: boolean): void => {
  PhysicalInputNative?.setEnabled?.(enabled);
};
