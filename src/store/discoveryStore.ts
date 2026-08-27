import {storage} from './mmkv';

// Discovery ("ディスカバリー") is a one-card-at-a-time triage flow. Every game
// the user judges there (favorite / hold / ignore) is recorded as "decided" so
// it doesn't resurface when Discovery is resumed. The decided set is the single
// source of truth for what has already been swiped through.
const STORE_KEY = 'user.discoveryDecided';

// The id used to track a title matches the key used for stars/ignores so the
// three lists line up (XCloudTitleId preferred, titleId as fallback).
export const getDiscoveryId = (titleItem: any): string => {
  if (!titleItem) {
    return '';
  }
  return titleItem.XCloudTitleId || titleItem.titleId || '';
};

export const getDecidedTitles = (): string[] => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return [];
  }
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDecidedTitles = (ids: string[]) => {
  storage.set(STORE_KEY, JSON.stringify(ids));
};

// Mark a title as judged in Discovery (idempotent).
export const addDecidedTitle = (id: string): string[] => {
  if (!id) {
    return getDecidedTitles();
  }
  const current = getDecidedTitles();
  if (current.includes(id)) {
    return current;
  }
  const next = [...current, id];
  saveDecidedTitles(next);
  return next;
};

// Reload: re-open the favorite + hold games for another pass while keeping the
// ignored ones excluded. Since ignored titles are filtered out of the queue by
// the ignore list anyway, we keep only the ignored ids in the decided set and
// drop the rest — everything the user didn't ignore becomes discoverable again.
export const reopenFavoritesAndHolds = (ignoreTitles: string[]): string[] => {
  const ignoreSet = new Set(ignoreTitles || []);
  const next = getDecidedTitles().filter(id => ignoreSet.has(id));
  saveDecidedTitles(next);
  return next;
};
