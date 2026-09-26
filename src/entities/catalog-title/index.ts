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

export type {GfnGame} from './api/gfnPublicGames';
export {
  steamAppIdFromUrl,
  getFreshGfnGames,
  getCachedGfnGames,
  fetchGfnGames,
} from './api/gfnPublicGames';

export type {
  GfnFullCatalogResult,
  GfnFullCatalogStatus,
  GfnAppDetails,
} from './api/gfnCatalog';
export {
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  clearOwnedGames,
  getGfnFullCatalogStatus,
  clearGfnFullCatalog,
  fetchGfnFullCatalog,
  getFreshFullCatalog,
  getCachedFullCatalog,
  GFN_SORT_MOST_POPULAR,
  GFN_SORT_LAST_ADDED,
  fetchGfnCatalogOrder,
  fetchGfnAppDetails,
  normalizeTitle,
  mergeOwnedGames,
} from './api/gfnCatalog';

export {getGfnLocaleSlug, getGfnGraphqlLocale} from './api/gfnLocale';
