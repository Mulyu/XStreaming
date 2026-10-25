// Public API for the physical-input feature: physical keyboard and mouse
// (USB, Bluetooth, Samsung DeX) events from the native bridge, for the stream
// screens to map onto each provider's own input.
export {usePhysicalInput} from './model/usePhysicalInput';
export type {
  PhysicalInputHandlers,
  PhysicalKeyEvent,
  PhysicalMouseButton,
} from './model/usePhysicalInput';
export {createGamepadMapper} from './model/gamepadMapper';
export type {GamepadMapper, GamepadMapperSink} from './model/gamepadMapper';
export {
  DEFAULT_BINDINGS,
  BINDING_TARGETS,
  MOUSE_BUTTON_IDS,
  STICK_DIRECTIONS,
  isStickDirection,
  assignKey,
  assignMouse,
  unbindKey,
  unbindMouse,
  inputsForTarget,
} from './model/bindings';
export type {
  BindingTarget,
  GamepadButtonName,
  InputBindings,
  StickDirection,
} from './model/bindings';
export {
  getInputBindings,
  saveInputBindings,
  resetInputBindings,
} from './model/bindingsStore';
export {keyLabel} from './model/keyNames';
export {useKeyCapture} from './model/useKeyCapture';
