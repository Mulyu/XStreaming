import {storage} from '../../../shared/lib/mmkv';

// When a title was last launched, keyed by normalized title (the same key
// entities/catalog-title groups xCloud/GFN/PS Plus entries under) so the
// Library's "Recently played" sort works the same regardless of provider.
// Recorded locally on-device at launch time rather than read from a
// provider API: xCloud (MRU) and GFN (lastPlayedDate-sorted library) each
// have their own, but PS Plus has none at all, so a per-provider API-backed
// sort can never rank a PS Plus title. Stored as one object (not one MMKV
// key per title) so the sort can load the whole set in a single read, same
// rationale as favorites.ts.

const STORE_KEY = 'user.catalogPlayHistory';

export const getPlayHistory = (): Record<string, number> => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const getLastPlayedAt = (titleKey: string): number | undefined =>
  getPlayHistory()[titleKey];

export const recordTitlePlayed = (titleKey: string): void => {
  const next = {...getPlayHistory(), [titleKey]: Date.now()};
  try {
    storage.set(STORE_KEY, JSON.stringify(next));
  } catch {}
};
