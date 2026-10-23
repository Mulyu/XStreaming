import {storage} from '../../../shared/lib/mmkv';
import type {PsSaleMap} from '../api/psStoreGrid';

// PS Store sale percents (discounted titles only, so it stays small), from one
// daily crawl of the PS5 category. Kept apart from the other price caches so
// refreshing one never resets another's age.
const STORE_KEY = 'user.psstore.sales.v1';

type PsSaleCache = {locale: string; at: number; sales: PsSaleMap};

// Sales change slowly enough that a day-old crawl is almost always right.
export const PS_SALE_TTL_MS = 24 * 60 * 60 * 1000;

export const getFreshPsSales = (locale: string): PsSaleMap | null => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as PsSaleCache;
    if (
      cache &&
      cache.locale === locale &&
      cache.sales &&
      Date.now() - cache.at < PS_SALE_TTL_MS
    ) {
      return cache.sales;
    }
  } catch {}
  return null;
};

export const savePsSales = (locale: string, sales: PsSaleMap) => {
  try {
    storage.set(
      STORE_KEY,
      JSON.stringify({locale, at: Date.now(), sales} as PsSaleCache),
    );
  } catch {
    // Ignore persistence failures; the next launch just crawls again.
  }
};
