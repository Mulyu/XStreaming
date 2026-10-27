import {storage} from '../../../shared/lib/mmkv';

// Flips the mouse's up/down on the right stick, per provider. The mouse push
// up looked down on Xbox and up on PS Plus on real devices, so Xbox starts
// flipped and PS Plus as is: both look up by default. The input-mapping screen
// shows the result (up/down), not the flip.
export type MouseLookProvider = 'xbox' | 'ps';

const DEFAULTS: Record<MouseLookProvider, boolean> = {xbox: true, ps: false};
const keyFor = (provider: MouseLookProvider) =>
  `user.mouseLookReverseY.${provider}`;

export const getMouseLookReverseY = (provider: MouseLookProvider): boolean => {
  try {
    return storage.getBoolean(keyFor(provider)) ?? DEFAULTS[provider];
  } catch {
    return DEFAULTS[provider];
  }
};

export const saveMouseLookReverseY = (
  provider: MouseLookProvider,
  value: boolean,
): void => {
  try {
    storage.set(keyFor(provider), value);
  } catch {}
};

export const resetMouseLook = (): void => {
  try {
    storage.delete(keyFor('xbox'));
    storage.delete(keyFor('ps'));
  } catch {}
};
