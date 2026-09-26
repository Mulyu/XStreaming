export {
  saveSettings as saveVirtualGamepadLayout,
  deleteSetting as deleteVirtualGamepadLayout,
  getSettings as getVirtualGamepadLayouts,
} from './model/virtualGamepadLayout';

export type {SwipeConfig} from './model/touchProfile';
export {
  DEFAULT_SWIPE,
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
  getCoverEnabled,
  setCoverEnabled,
  getLastProfileForGame,
  setLastProfileForGame,
} from './model/touchProfile';

export type {CoverButton} from './model/coverLayout';
export {
  defaultCoverLayout,
  getCoverLayout,
  saveCoverLayout,
} from './model/coverLayout';

export type {ButtonConfig} from './lib/gamepadLayout';
export {
  SWIPE_AIM_NAME,
  SWIPE_AIM_MIN,
  createDefaultSwipePad,
  ensureSwipePad,
  getButtonBaseSize,
  LAYOUT_SNAP_GRID,
  snapToGrid,
  buildDefaultLayout,
} from './lib/gamepadLayout';

export type {
  VirtualMacroButtonName,
  VirtualMacroStep,
} from './lib/virtualMacro';
export {
  VIRTUAL_MACRO_BUTTON_NAMES,
  isMacroButtonName,
  MACRO_SLOT_COLORS,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  DEFAULT_VIRTUAL_MACRO_LOOP_INTERVAL_MS,
  DEFAULT_VIRTUAL_MACRO_STEPS,
  createDefaultMacroLayoutButtons,
  ensureMacroLayoutButtons,
  normalizeMacroLoopIntervalMs,
  normalizeMacroStep,
  normalizeMacroSteps,
} from './lib/virtualMacro';

export {coverGamepadBus} from './lib/coverGamepadBus';

export {default as GamepadButtonPreview} from './ui/GamepadButtonPreview';
export {default as GamepadButton} from './ui/GamepadButton';
export {default as KeyChip} from './ui/KeyChip';
export {default as CoverLayoutOverlay} from './ui/CoverLayoutOverlay';
export {default as CustomVirtualGamepad} from './ui/CustomVirtualGamepad';
export {
  default as PortraitVirtualGamepad,
  type PortraitGamepadControl,
} from './ui/PortraitVirtualGamepad';
