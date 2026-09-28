// Public API for the virtual-gamepad-editor widget: the full-screen
// button-layout/swipe-aim/gyro-aim/macro editor, shared verbatim by the
// in-stream quick-edit overlay (pages/native-stream) and the standalone
// Settings screen (pages/custom-gamepad). It's a widget rather than living in
// either page, or in features/controller-customization itself, because it
// composes that feature's own UI with features/virtual-keyboard's KeyPicker
// -- same-layer features never import each other directly, so composing two
// of them belongs one layer up. Consumers import from here, not from
// ui/VirtualGamepadEditor directly.
export {
  default as VirtualGamepadEditor,
  type VirtualGamepadEditorProps,
} from './ui/VirtualGamepadEditor';
export type {ButtonConfig} from './ui/VirtualGamepadEditor';
