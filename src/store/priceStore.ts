import {storage} from './mmkv';
import {PriceInfo, RatingInfo} from '../utils/storePrice';

// Store prices are cached separately from the title catalog so refreshing
// prices doesn't reset the catalog's own cache age.
const STORE_KEY = 'user.xcloud.prices';
const POPULAR_KEY = 'user.xcloud.popular';

export type PriceCache = {
  priceMap: Record<string, PriceInfo>;
  ratingMap?: Record<string, RatingInfo>;
  market: string;
  // Signature of the title set the map was fetched for, so the list can tell
  // whether the cache still covers the current catalog (see Cloud).
  sig?: string;
  updatedAt: number;
};

export type PopularCache = {
  order: string[];
  market: string;
  updatedAt: number;
};

// Refetch Store prices / popularity at most once per this window (both change
// slowly).
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
  ratingMap: Record<string, RatingInfo>,
  market: string,
  sig?: string,
) => {
  const cache: PriceCache = {
    priceMap,
    ratingMap,
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

// Return the fresh popularity order for the given market, or null.
export const getFreshPopularOrder = (market: string): string[] | null => {
  const data = storage.getString(POPULAR_KEY);
  if (!data) {
    return null;
  }
  try {
    const cache = JSON.parse(data) as PopularCache;
    if (
      cache &&
      cache.market === market &&
      Array.isArray(cache.order) &&
      Date.now() - cache.updatedAt < PRICE_TTL_MS
    ) {
      return cache.order;
    }
  } catch {
    return null;
  }
  return null;
};

export const savePopularOrder = (order: string[], market: string) => {
  const cache: PopularCache = {
    order,
    market,
    updatedAt: new Date().getTime(),
  };
  try {
    storage.set(POPULAR_KEY, JSON.stringify(cache));
  } catch {
    // Ignore persistence failures; the order will simply refetch next session.
  }
};
