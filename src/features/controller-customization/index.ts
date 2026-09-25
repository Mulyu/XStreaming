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
