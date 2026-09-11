import {storage} from './mmkv';
import {SteamPriceInfo} from '../utils/steamPrice';

// Cached separately from both the xCloud price cache and the catalog itself,
// same reasoning as priceStore.ts -- refreshing one doesn't reset the others'
// cache age.
const STORE_KEY = 'user.steam.prices';

export type SteamPriceCache = {
  priceMap: Record<string, SteamPriceInfo>;
  cc: string;
  // Signature of the appid set the map was fetched for, so callers can tell
  // whether the cache still covers the current catalog.
  sig?: string;
  updatedAt: number;
};

// Steam sales change slowly enough that a day-old cache is still accurate
// almost all the time; matches priceStore.ts's PRICE_TTL_MS.
export const STEAM_PRICE_TTL_MS = 24 * 60 * 60 * 1000;

export const getFreshSteamPriceCache = (cc: string): SteamPriceCache | null => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return null;
  }
  try {
    const cache = JSON.parse(data) as SteamPriceCache;
    if (
      cache &&
      cache.cc === cc &&
      Date.now() - cache.updatedAt < STEAM_PRICE_TTL_MS
    ) {
      return cache;
    }
  } catch {
    return null;
  }
  return null;
};

export const saveSteamPriceCache = (
  priceMap: Record<string, SteamPriceInfo>,
  cc: string,
  sig?: string,
) => {
  const cache: SteamPriceCache = {
    priceMap,
    cc,
    sig,
    updatedAt: Date.now(),
  };
  try {
    storage.set(STORE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore persistence failures; prices will simply refetch next session.
  }
};
