// Public API for the physical-input feature: physical keyboard and mouse
// (USB, Bluetooth, Samsung DeX) events from the native bridge, for the stream
// screens to map onto each provider's own input.
export {usePhysicalInput} from './model/usePhysicalInput';
export type {
  PhysicalInputHandlers,
  PhysicalKeyEvent,
  PhysicalMouseButton,
} from './model/usePhysicalInput';
