// Public API for the catalog-title entity (the merged xCloud+GFN title
// shape the Library/Store screens render). Consumers outside this slice
// import from here, not from model/unifiedCatalog directly.
export type {CatalogTitle} from './model/unifiedCatalog';
export {
  buildUnifiedCatalog,
  isCatalogTitleOwned,
  buildXcloudCatalogTitle,
  buildGfnCatalogTitle,
} from './model/unifiedCatalog';

export {
  getFavoriteKeys,
  isCatalogTitleFavorite,
  setCatalogTitleFavorite,
} from './model/favorites';

export type {CatalogPreference} from './model/preferences';
export {getCatalogPreference, setCatalogPreference} from './model/preferences';

export {
  saveXcloudData,
  getXcloudData,
  clearXcloudData,
  isxCloudDataValid,
} from './model/xcloudCache';

export type {PriceCache, PopularCache} from './model/priceCache';
export {
  PRICE_TTL_MS,
  getPriceCache,
  getFreshPriceCache,
  savePriceCache,
  getFreshPopularOrder,
  savePopularOrder,
} from './model/priceCache';

export type {SteamPriceCache} from './model/steamPriceCache';
export {
  STEAM_PRICE_TTL_MS,
  getFreshSteamPriceCache,
  saveSteamPriceCache,
} from './model/steamPriceCache';

export {getFreshGfnRankOrder, saveGfnRankOrder} from './model/gfnRankCache';

export {default as XcloudCatalogApi} from './api/xcloudCatalogApi';

export type {XcloudCatalogStatus} from './api/loadXcloudCatalog';
export {
  loadXcloudCatalog,
  getXcloudCatalogStatus,
  clearXcloudCatalogStatus,
} from './api/loadXcloudCatalog';

export type {
  PriceInfo,
  RatingInfo,
  TrailerInfo,
  TitleDetails,
  FetchPricesResult,
  FetchTitleDetailsResult,
} from './api/storePrice';
export {
  getStoreUrl,
  deriveMarketLanguage,
  extractPrice,
  extractRating,
  extractDetails,
  fetchPrices,
  delay,
  fetchPricesWithRetry,
  fetchTitleDetails,
  getPrice,
  formatPrice,
  discountPercent,
  isSaleForDisplay,
  formatSaleEnd,
} from './api/storePrice';

export type {SteamPriceInfo} from './api/steamPrice';
export {fetchSteamPrices, isSteamSaleForDisplay} from './api/steamPrice';

export {fetchPopularOrder, buildPopularRank} from './api/popularOrder';

// ui/titleCapabilities is deliberately NOT re-exported here: it pulls in
// react-native-vector-icons, which would drag a native-UI dependency into
// every consumer of this barrel -- including pages/storeLogic.ts, split out
// of Store.tsx specifically to stay light enough for Jest to load directly
// (see its own comment). Import it from './ui/titleCapabilities' instead.
