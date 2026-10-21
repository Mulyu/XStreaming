import {storage} from '../../../shared/lib/mmkv';
import {PsStorePriceInfo} from '../api/psStorePrice';

// Per-concept PS Store prices/trials for the Library list. Kept apart from
// the xCloud and Steam price caches (see steamPriceCache.ts) so refreshing
// one never resets another's age. Entries age out individually because the
// map fills in over many requests across sessions.
const STORE_KEY = 'user.psstore.prices';

type PsPriceCache = {
  locale: string;
  entries: Record<string, {at: number; info: PsStorePriceInfo}>;
};

// Sales change slowly enough that a day-old entry is almost always right;
// matches steamPriceCache.ts.
export const PS_PRICE_TTL_MS = 24 * 60 * 60 * 1000;

const read = (locale: string): PsPriceCache => {
  const data = storage.getString(STORE_KEY);
  if (data) {
    try {
      const cache = JSON.parse(data) as PsPriceCache;
      if (cache && cache.locale === locale && cache.entries) {
        return cache;
      }
    } catch {}
  }
  return {locale, entries: {}};
};

// The entries still within the TTL for this locale.
export const getFreshPsPrices = (
  locale: string,
): Record<string, PsStorePriceInfo> => {
  const now = Date.now();
  const out: Record<string, PsStorePriceInfo> = {};
  Object.entries(read(locale).entries).forEach(([id, e]) => {
    if (now - e.at < PS_PRICE_TTL_MS) {
      out[id] = e.info;
    }
  });
  return out;
};

// Merge newly fetched infos into the stored map.
export const savePsPrices = (
  locale: string,
  fetched: Record<string, PsStorePriceInfo>,
) => {
  const cache = read(locale);
  const at = Date.now();
  Object.entries(fetched).forEach(([id, info]) => {
    cache.entries[id] = {at, info};
  });
  try {
    storage.set(STORE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore persistence failures; prices will simply refetch next session.
  }
};
