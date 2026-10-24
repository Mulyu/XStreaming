import {storage} from '../../../shared/lib/mmkv';
import {WishlistEntry, removeEntry, upsertEntry} from './wishlistLogic';

// The wishlist: titles the user wants but doesn't own. Stored as one array
// (like favorites.ts) so the Library can load it in a single read.

const STORE_KEY = 'user.catalogWishlist';
// Favorites already looked at for the owned-only change (see
// favoritesToWishlist) -- kept per title so one that wasn't in the catalog
// yet is picked up later, and one the user later takes off the wishlist
// isn't put back.
const MIGRATED_KEY = 'user.catalogWishlist.migratedFavorites';

export const getWishlist = (): WishlistEntry[] => {
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

export const saveWishlist = (list: WishlistEntry[]): WishlistEntry[] => {
  try {
    storage.set(STORE_KEY, JSON.stringify(list));
  } catch {}
  return list;
};

export const isCatalogTitleWishlisted = (titleKey: string): boolean =>
  getWishlist().some(entry => entry.key === titleKey);

export const addToWishlist = (entry: WishlistEntry): WishlistEntry[] =>
  saveWishlist(upsertEntry(getWishlist(), entry));

export const removeFromWishlist = (titleKey: string): WishlistEntry[] =>
  saveWishlist(removeEntry(getWishlist(), titleKey));

export const getMigratedFavoriteKeys = (): string[] => {
  const raw = storage.getString(MIGRATED_KEY);
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

export const markFavoritesMigrated = (keys: string[]) => {
  try {
    storage.set(
      MIGRATED_KEY,
      JSON.stringify(
        Array.from(new Set([...getMigratedFavoriteKeys(), ...keys])),
      ),
    );
  } catch {}
};
