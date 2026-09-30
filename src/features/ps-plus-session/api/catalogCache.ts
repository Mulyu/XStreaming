import {storage} from '../../../shared/lib/mmkv';
import type {CloudGame} from './catalog';

// A JS-side (mmkv) cache of fetchUnifiedCatalog()'s result, mirroring
// entities/catalog-title's GFN full-catalog cache (getFreshFullCatalog /
// getCachedFullCatalog). The native fetch already disk-caches its own result
// for 24h (see cloudcatalog_unified.c's CC_CACHE_TTL_MS) and short-circuits
// to "no network" on a hit, but that's still a JNI round trip the JS side has
// to await -- unlike xCloud/GFN, which paint instantly from a synchronous
// cache read at mount (getXcloudData/getCachedFullCatalog), PS Plus started
// every Library screen mount from an empty list and waited on that round
// trip, making it visibly the slowest of the three providers to appear even
// when the native cache was warm. This gives it the same instant-paint
// treatment.
const STORE_KEY = 'user.psPlusCatalog';
// Matches the native disk cache's own TTL so this layer never claims
// "fresh" for longer than the native fetch itself would keep serving the
// same cached data.
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

export const saveCatalogGames = (games: CloudGame[]) => {
  try {
    storage.set(STORE_KEY, JSON.stringify({ts: Date.now(), games}));
  } catch {
    // Best-effort -- a write failure just means the next mount falls back to
    // an empty list until the network fetch resolves, same as before this
    // cache existed.
  }
};

export const getFreshCatalogGames = (): CloudGame[] | null => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.games) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < CATALOG_TTL_MS
    ) {
      return parsed.games as CloudGame[];
    }
  } catch {
    // Fall through to null below.
  }
  return null;
};

// Any cached value regardless of freshness, for instant-paint on mount --
// mirrors getCachedFullCatalog's own reasoning: showing a stale list for the
// brief window until a background refresh lands beats showing nothing.
export const getCachedCatalogGames = (): CloudGame[] | null => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.games) ? (parsed.games as CloudGame[]) : null;
  } catch {
    return null;
  }
};

// Called alongside clearNpsso() on sign-out, so a different PSN account
// signing in next doesn't briefly instant-paint the previous account's
// cached catalog before the fresh fetch lands.
export const clearCatalogGames = () => {
  storage.delete(STORE_KEY);
};
