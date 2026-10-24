// Pure matching/pagination logic for the Store screen, pulled out of
// Store.tsx so it can be unit tested directly (Store.tsx itself pulls in
// react-navigation, which the project's current Jest config can't load).
import {
  GfnGame,
  buildGfnCatalogTitle,
  buildXcloudCatalogTitle,
  buildPsPlusCatalogTitle,
  CatalogTitle,
  discountPercent,
  formatPrice,
  getPrice,
  isSaleForDisplay,
  PriceInfo,
  ProductBasics,
  WishlistRefs,
  WishlistSnapshot,
  normalizeTitle,
} from '../../entities/catalog-title';
import {SteamChartEntry, PsStoreChartEntry} from '../../features/store-charts';

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
  // Whole-number percent off when on sale (e.g. 30 for -30%).
  discountPercent?: number;
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
  // Display data for ids that are not in the signed-in account's own catalog
  // (see fetchProductBasics). With `availableOnly` off, such an id becomes a
  // non-launchable row (null catalogTitle) once its basics have arrived,
  // like the GFN/PS Store rows; with it on, or while the basics are missing,
  // it is dropped as before.
  basics: Record<string, ProductBasics> = {},
  availableOnly = true,
): StoreRow[] => {
  const result: StoreRow[] = [];
  productIds.forEach((productId, index) => {
    const item = xcloudByProductId.get(productId.toUpperCase());
    const catalogTitle = item ? buildXcloudCatalogTitle(item) : null;
    const extra = catalogTitle
      ? undefined
      : availableOnly
      ? undefined
      : basics[productId.toUpperCase()];
    if (!catalogTitle && !extra) {
      return;
    }
    const priceInfo = getPrice(priceMap, productId);
    result.push({
      id: productId,
      rank: index + 1,
      title: catalogTitle ? catalogTitle.title : extra!.title,
      imageUrl: catalogTitle ? catalogTitle.imageUrl : extra!.imageUrl,
      price: priceInfo
        ? formatPrice(priceInfo.listPrice, priceInfo.currencyCode)
        : undefined,
      originalPrice:
        priceInfo && isSaleForDisplay(priceInfo)
          ? formatPrice(priceInfo.msrp, priceInfo.currencyCode)
          : undefined,
      discountPercent:
        priceInfo && isSaleForDisplay(priceInfo)
          ? discountPercent(priceInfo)
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
      discountPercent: entry.discountPercent || undefined,
      catalogTitle,
    };
  });
};

// Every PS Store chart entry becomes a row -- same "show the real chart,
// gray out what isn't cloud-playable" behavior as buildGfnStoreRows, not
// buildXboxStoreRows's "drop unmatched entries" one, since PS Store's own
// category API already carries full display data per entry (name/image/
// price), independent of whether the title is also in the signed-in
// account's PS Plus cloud-streaming catalog.
//
// Matched against BOTH `productId` and `storeProductId`, not storeProductId
// alone: libchiaki's own JSON contract (cloudcatalog.h) documents
// storeProductId as populated only for "owned"/"purchaseable" rows -- a
// "streamable" row (in the account's current PS Plus Extra/Premium catalog,
// not owned) carries none, so matching on it alone silently dropped every
// genuine Plus-catalog title from the filter while still matching ordinary
// purchaseable listings that aren't actually free to stream. libchiaki's own
// native cross-referencing (cloudcatalog_merge.c's streamability_is_streamable)
// tries productId first for exactly this reason -- productId is the one
// field every row's schema guarantees ("canonical catalog id; unique in this
// array"), with storeProductId only as a supplementary commerce-specific id.
export const buildPsStoreRows = (
  entries: PsStoreChartEntry[],
  psPlusGames: any[],
): StoreRow[] => {
  const byProductId = new Map<string, any>();
  psPlusGames.forEach(game => {
    if (game?.productId) {
      byProductId.set(game.productId, game);
    }
    if (game?.storeProductId) {
      byProductId.set(game.storeProductId, game);
    }
  });
  return entries.map((entry, index) => {
    const game = byProductId.get(entry.productId);
    const catalogTitle = game ? buildPsPlusCatalogTitle(game) : null;
    return {
      id: entry.productId,
      rank: index + 1,
      title: entry.title,
      imageUrl: entry.imageUrl,
      price: entry.price,
      originalPrice: entry.originalPrice,
      discountPercent: entry.discountPercent || undefined,
      catalogTitle,
    };
  });
};

export type StoreProvider = 'xcloud' | 'gfn' | 'psstore';

// Which id a row's `id` is, per tab.
const refsForRow = (provider: StoreProvider, id: string): WishlistRefs =>
  provider === 'xcloud'
    ? {xbox: id}
    : provider === 'gfn'
    ? {steam: id}
    : {ps: id};

// What the row was showing, saved with a wishlisted title as its last-seen
// price.
export const rowSnapshot = (row: StoreRow): WishlistSnapshot => ({
  price: row.price,
  originalPrice: row.originalPrice,
  discountPercent: row.discountPercent || 0,
});

// The title a Store row opens and is saved as. A row only knows its own
// service's entry (`row.catalogTitle`); `index` is every loaded streaming
// catalog merged by normalized title (the same merge the Library grid uses), so
// the detail screen can show the title across all services. A row no
// catalog contains becomes a title with only its store id and price (nothing
// to play) rather than being unopenable.
export const resolveRowTitle = (
  row: StoreRow,
  provider: StoreProvider,
  index: Map<string, CatalogTitle>,
): CatalogTitle => {
  const key = row.catalogTitle?.key ?? normalizeTitle(row.title);
  const merged = index.get(key);
  if (merged) {
    return merged;
  }
  if (row.catalogTitle) {
    return row.catalogTitle;
  }
  return {
    key,
    title: row.title,
    imageUrl: row.imageUrl,
    genres: [],
    store: {refs: refsForRow(provider, row.id), snapshot: rowSnapshot(row)},
  };
};

// The ids and price a Store row adds to the wishlist entry for its title.
export const rowWishlistExtra = (
  row: StoreRow,
  provider: StoreProvider,
): {refs: WishlistRefs; snapshot: WishlistSnapshot} => ({
  refs: refsForRow(provider, row.id),
  snapshot: rowSnapshot(row),
});
