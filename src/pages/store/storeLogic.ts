// Pure matching/pagination logic for the Store screen, pulled out of
// Store.tsx so it can be unit tested directly (Store.tsx itself pulls in
// react-navigation, which the project's current Jest config can't load).
import {
  GfnGame,
  buildGfnCatalogTitle,
  buildXcloudCatalogTitle,
  CatalogTitle,
  formatPrice,
  getPrice,
  isSaleForDisplay,
  PriceInfo,
} from '../../entities/catalog-title';
import {SteamChartEntry} from '../../features/store-charts';

// One row's worth of display data. `catalogTitle` is null when the row isn't
// launchable -- today that's only possible on the GFN/Steam side, where the
// chart entry itself already carries full display data (title/image/price)
// straight from Steam, independent of whether the title is also on GFN, so
// there's no reason to drop it from the list just because it isn't (the
// Xbox/xCloud side has no such split: its browse endpoint returns bare
// product ids with no display data of its own, so a row only exists there
// once matched against the entitled catalog, and its `catalogTitle` is
// therefore always non-null -- see buildXboxStoreRows below). `id` is the
// underlying store id (Xbox productId / Steam appId) -- the list key must be
// this, not catalogTitle.key (a normalized title): two distinct store
// listings (a different edition/SKU of the same game, or two unrelated
// titles that happen to share a display name) can share a normalized title
// while being genuinely different rows, and keying by title would collide
// React's list reconciliation between them.
export type StoreRow = {
  id: string;
  rank: number;
  title: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  catalogTitle: CatalogTitle | null;
};

// Whether another page is worth requesting after one that left the cursor at
// `cumulativeStart`. Steam's search endpoint doesn't reliably return a full
// `count`-sized page even mid-list (confirmed live: a page can come back
// with 95-98 of a requested 100 rows while total_count is still in the
// thousands), so "got fewer than we asked for" is not a valid end-of-results
// signal -- only an empty page, or reaching the endpoint's own total count,
// is. Xbox's browse endpoint reports its own total the same way, so the same
// check applies to both.
export const hasMorePages = (
  entriesLength: number,
  cumulativeStart: number,
  totalCount?: number,
): boolean => {
  if (entriesLength === 0) {
    return false;
  }
  return totalCount === undefined || cumulativeStart < totalCount;
};

// Both charts are live, frequently-reordering rankings fetched via a
// stateless numeric offset or a cursor spanning several sequential requests
// -- confirmed live that the same title can resurface at a much later
// position if the underlying ranking shifts between requests (e.g. a sale
// starting or ending mid-scroll). Deduping by key keeps that from showing as
// a duplicate row (and from breaking FlatList's key uniqueness). Keeps the
// first occurrence of each key.
export const dedupeByKey = <T>(items: T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
};

// Match Xbox's browse productIds against the signed-in user's own entitled
// xCloud catalog (the browse endpoint only returns bare ids -- see
// xboxBrowse.ts), keeping the chart's own rank (position in `productIds`)
// so a filtered-out title still leaves a visible gap rather than silently
// compacting the list.
export const buildXboxStoreRows = (
  productIds: string[],
  xcloudByProductId: Map<string, any>,
  priceMap: Record<string, PriceInfo>,
): StoreRow[] => {
  const result: StoreRow[] = [];
  productIds.forEach((productId, index) => {
    const item = xcloudByProductId.get(productId.toUpperCase());
    if (!item) {
      return;
    }
    const catalogTitle = buildXcloudCatalogTitle(item);
    if (!catalogTitle) {
      return;
    }
    const priceInfo = getPrice(priceMap, productId);
    result.push({
      id: productId,
      rank: index + 1,
      title: catalogTitle.title,
      imageUrl: catalogTitle.imageUrl,
      price: priceInfo
        ? formatPrice(priceInfo.listPrice, priceInfo.currencyCode)
        : undefined,
      originalPrice:
        priceInfo && isSaleForDisplay(priceInfo)
          ? formatPrice(priceInfo.msrp, priceInfo.currencyCode)
          : undefined,
      catalogTitle,
    });
  });
  return result;
};

// Every Steam chart entry becomes a row -- unlike the Xbox side, Steam's own
// chart already carries full display data, so a title not on GFN is still
// shown, just with a null catalogTitle (nothing to launch). Matched against
// GFN's catalog (the public list and, for signed-in users, the full
// authenticated catalog merged in by the caller -- see Store.tsx's
// gfnBaseGames for why that's a merge, not a fallback) only to attach that
// launchable catalogTitle where available, same rank-preserving behavior as
// buildXboxStoreRows.
export const buildGfnStoreRows = (
  entries: SteamChartEntry[],
  gfnBaseGames: GfnGame[],
): StoreRow[] => {
  const byAppId = new Map<string, GfnGame>();
  gfnBaseGames.forEach(game => {
    if (game.steamAppId) {
      byAppId.set(game.steamAppId, game);
    }
  });
  return entries.map((entry, index) => {
    const game = byAppId.get(entry.appId);
    const catalogTitle = game ? buildGfnCatalogTitle(game) : null;
    return {
      id: entry.appId,
      rank: index + 1,
      title: entry.title,
      imageUrl: entry.imageUrl,
      price: entry.price,
      originalPrice: entry.originalPrice,
      catalogTitle,
    };
  });
};
