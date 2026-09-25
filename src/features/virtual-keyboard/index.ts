// Public API for the virtual-keyboard feature (GFN's on-screen keyboard and
// per-profile custom key buttons' shared modifier-latch state). Consumers
// outside this slice import from here, not from lib/useKeyboardModifiers
// directly.
export {useKeyboardModifiers} from './lib/useKeyboardModifiers';
export type {KeyboardModifiers} from './lib/useKeyboardModifiers';

export type {PickableKey, KeyCategory} from './lib/virtualKeys';
export {KEY_CATEGORIES, VK_TO_MOD_BIT, MOD_BIT_TO_VK} from './lib/virtualKeys';
