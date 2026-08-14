import {storage} from './mmkv';
import {PriceInfo} from '../utils/storePrice';

// Store prices are cached separately from the title catalog so refreshing
// prices doesn't reset the catalog's own cache age.
const STORE_KEY = 'user.xcloud.prices';

export type PriceCache = {
  priceMap: Record<string, PriceInfo>;
  market: string;
  // Signature of the title set the map was fetched for, so the list can tell
  // whether the cache still covers the current catalog (see Cloud).
  sig?: string;
  updatedAt: number;
};

// Refetch Store prices at most once per this window (sales change slowly).
export const PRICE_TTL_MS = 24 * 60 * 60 * 1000;

export const getPriceCache = (): PriceCache | null => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data) as PriceCache;
  } catch {
    return null;
  }
};

// Return the cache only when it holds fresh prices for the given market.
export const getFreshPriceCache = (market: string): PriceCache | null => {
  const cache = getPriceCache();
  if (
    cache &&
    cache.market === market &&
    Date.now() - cache.updatedAt < PRICE_TTL_MS
  ) {
    return cache;
  }
  return null;
};

export const savePriceCache = (
  priceMap: Record<string, PriceInfo>,
  market: string,
  sig?: string,
) => {
  const cache: PriceCache = {
    priceMap,
    market,
    sig,
    updatedAt: new Date().getTime(),
  };
  try {
    storage.set(STORE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore persistence failures; prices will simply refetch next session.
  }
};
