import {storage} from './mmkv';

// Favorited titles in the unified Library, keyed by normalized title (the
// same key catalog/unifiedCatalog.ts groups xCloud/GFN entries under) so a
// title can be favorited regardless of which provider(s) it's on. Stored as
// one array (not one MMKV key per title) so the Library grid's filter can
// load the whole set in a single read.

const STORE_KEY = 'user.catalogFavorites';

export const getFavoriteKeys = (): string[] => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const isCatalogTitleFavorite = (titleKey: string): boolean =>
  getFavoriteKeys().includes(titleKey);

export const setCatalogTitleFavorite = (
  titleKey: string,
  favorite: boolean,
): string[] => {
  const current = getFavoriteKeys();
  const next = favorite
    ? current.includes(titleKey)
      ? current
      : [...current, titleKey]
    : current.filter(key => key !== titleKey);
  try {
    storage.set(STORE_KEY, JSON.stringify(next));
  } catch {}
  return next;
};
