import {storage} from './mmkv';

// Remembers, per game (keyed by its normalized title -- the same key the
// unified Library catalog groups xCloud/GFN entries under), which provider
// the user actually wants to play it on, and -- for GeForce NOW, where the
// same game can be linked through more than one store -- which store copy.
// Lets a card launch straight into a stream on repeat visits instead of
// re-asking "Play on Xbox Cloud or GeForce NOW?" every time.

export type CatalogPreference =
  | {provider: 'xcloud'}
  | {provider: 'gfn'; store: string; gfnId: string};

const KEY_PREFIX = 'catalogPref.';

export const getCatalogPreference = (
  titleKey: string,
): CatalogPreference | null => {
  const raw = storage.getString(KEY_PREFIX + titleKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.provider === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

export const setCatalogPreference = (
  titleKey: string,
  preference: CatalogPreference,
): void => {
  try {
    storage.set(KEY_PREFIX + titleKey, JSON.stringify(preference));
  } catch {}
};

export const clearCatalogPreference = (titleKey: string): void => {
  try {
    storage.delete(KEY_PREFIX + titleKey);
  } catch {}
};
