import {storage} from './mmkv';

// Caches GFN catalog-wide rank orders (Most Popular / Newest), fetched from
// the authenticated apps() browse query -- see gfn/catalog.ts. Keyed by sort
// kind rather than market: unlike xCloud Store prices, GFN's catalog rank
// doesn't vary by region in a way this app needs to track.
const KEY_PREFIX = 'gfn.rank.';
const TTL_MS = 24 * 60 * 60 * 1000;

type RankCache = {order: string[]; updatedAt: number};

export const getFreshGfnRankOrder = (kind: string): string[] | null => {
  const raw = storage.getString(KEY_PREFIX + kind);
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as RankCache;
    if (Array.isArray(cache.order) && Date.now() - cache.updatedAt < TTL_MS) {
      return cache.order;
    }
  } catch {}
  return null;
};

export const saveGfnRankOrder = (kind: string, order: string[]): void => {
  try {
    const cache: RankCache = {order, updatedAt: Date.now()};
    storage.set(KEY_PREFIX + kind, JSON.stringify(cache));
  } catch {}
};
