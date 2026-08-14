import {storage} from './mmkv';
import {PriceInfo} from '../utils/storePrice';

// Store prices are cached separately from the title catalog so refreshing
// prices doesn't reset the catalog's own cache age.
const STORE_KEY = 'user.xcloud.prices';

export type PriceCache = {
  priceMap: Record<string, PriceInfo>;
  market: string;
  updatedAt: number;
};

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

export const savePriceCache = (
  priceMap: Record<string, PriceInfo>,
  market: string,
) => {
  const cache: PriceCache = {
    priceMap,
    market,
    updatedAt: new Date().getTime(),
  };
  try {
    storage.set(STORE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore persistence failures; prices will simply refetch next session.
  }
};
