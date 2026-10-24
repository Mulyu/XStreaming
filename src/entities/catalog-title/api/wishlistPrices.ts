import {
  fetchPrices,
  formatPrice,
  discountPercent,
  isSaleForDisplay,
} from './storePrice';
import {fetchSteamPrices, isSteamSaleForDisplay} from './steamPrice';
import {lookupPsSale} from './psStoreGrid';
import type {PsSaleMap} from './psStoreGrid';
import type {WishlistEntry, WishlistSnapshot} from '../model/wishlistLogic';

// Re-prices wishlisted titles that the loaded streaming catalogs don't
// contain, so the sale balloon and the card's price stay current for them
// too. Titles that are in a catalog are priced by the Library itself.
//
// Each service is asked only about the id it was wishlisted with; the
// snapshot keeps whichever service has the deepest discount (or the first
// one that answered, when nothing is discounted).

// Picks the snapshot to keep from what each service reported.
export const pickSnapshot = (
  candidates: WishlistSnapshot[],
): WishlistSnapshot | undefined => {
  let best: WishlistSnapshot | undefined;
  candidates.forEach(candidate => {
    if (
      !best ||
      (candidate.discountPercent || 0) > (best.discountPercent || 0)
    ) {
      best = candidate;
    }
  });
  return best;
};

export const refreshWishlistSnapshots = async (
  entries: WishlistEntry[],
  options: {
    market: string;
    language: string;
    steamCc: string;
    psSaleMap: PsSaleMap;
  },
): Promise<Record<string, WishlistSnapshot>> => {
  const xboxIds = entries
    .map(e => e.refs?.xbox)
    .filter((id): id is string => !!id);
  const steamIds = entries
    .map(e => e.refs?.steam)
    .filter((id): id is string => !!id);

  const [xbox, steam] = await Promise.all([
    xboxIds.length > 0
      ? fetchPrices(xboxIds, options.market, options.language)
      : Promise.resolve(null),
    steamIds.length > 0
      ? fetchSteamPrices(steamIds, options.steamCc)
      : Promise.resolve(null),
  ]);

  const result: Record<string, WishlistSnapshot> = {};
  entries.forEach(entry => {
    const candidates: WishlistSnapshot[] = [];

    const xboxInfo = entry.refs?.xbox
      ? xbox?.prices[entry.refs.xbox.toUpperCase()]
      : undefined;
    if (xboxInfo) {
      const sale = isSaleForDisplay(xboxInfo);
      candidates.push({
        price: formatPrice(xboxInfo.listPrice, xboxInfo.currencyCode),
        originalPrice: sale
          ? formatPrice(xboxInfo.msrp, xboxInfo.currencyCode)
          : undefined,
        discountPercent: sale ? discountPercent(xboxInfo) : 0,
      });
    }

    const steamInfo = entry.refs?.steam ? steam?.[entry.refs.steam] : undefined;
    if (steamInfo) {
      const sale = isSteamSaleForDisplay(steamInfo);
      candidates.push({
        price: formatPrice(steamInfo.final / 100, steamInfo.currencyCode),
        originalPrice: sale
          ? formatPrice(steamInfo.initial / 100, steamInfo.currencyCode)
          : undefined,
        discountPercent: sale ? steamInfo.discountPercent : 0,
      });
    }

    if (entry.refs?.ps) {
      // The PS sale list only carries percents. The price strings stay as
      // they were saved; they are dropped when the sale is over.
      const percent = lookupPsSale(options.psSaleMap, {
        productId: entry.refs.ps,
        name: entry.title,
      });
      const prev = entry.snapshot;
      candidates.push(
        percent > 0
          ? {
              price: prev?.price,
              originalPrice: prev?.originalPrice,
              discountPercent: percent,
            }
          : {price: prev?.price, discountPercent: 0},
      );
    }

    const picked = pickSnapshot(candidates);
    if (picked) {
      result[entry.key] = picked;
    }
  });
  return result;
};
