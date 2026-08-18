import axios from 'axios';
import {debugFactory} from './debug';
import {parseRegion} from './locale';

const log = debugFactory('storePrice');

// Microsoft Store DisplayCatalog. Public, no auth required. Prices are not
// included in the Game Pass catalog response, so we fetch them here keyed by
// the Store "big id" (which, for xCloud titles, equals the productId).
const CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';

// The API accepts many ids per request (verified with 400+ in one call); we
// still chunk conservatively so a single oversized URL can't fail the batch.
const BATCH_SIZE = 100;

// ISO 4217 currencies with zero minor units.
const ZERO_DECIMAL_CURRENCIES = [
  'JPY',
  'KRW',
  'CLP',
  'VND',
  'ISK',
  'PYG',
  'UGX',
  'RWF',
  'XAF',
  'XOF',
  'XPF',
  'DJF',
  'GNF',
  'KMF',
  'BIF',
  'VUV',
];

// Currencies written with three minor units.
const THREE_DECIMAL_CURRENCIES = [
  'KWD',
  'BHD',
  'OMR',
  'JOD',
  'TND',
  'IQD',
  'LYD',
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  KRW: '₩',
  CNY: '¥',
  TWD: 'NT$',
  HKD: 'HK$',
  AUD: 'A$',
  CAD: 'CA$',
  NZD: 'NZ$',
  SGD: 'S$',
  BRL: 'R$',
  INR: '₹',
  RUB: '₽',
  MXN: 'MX$',
  ZAR: 'R',
  TRY: '₺',
  THB: '฿',
  PHP: '₱',
  PLN: 'zł',
  ILS: '₪',
  SAR: '﷼',
  AED: 'د.إ',
};

export type PriceInfo = {
  listPrice: number; // current buyable price (already reflects any discount)
  msrp: number; // original price
  currencyCode: string;
  onSale: boolean;
  saleEndDate?: string; // ISO string, only present while on sale
};

export type RatingInfo = {
  average: number; // Store user rating, 1-5
  count: number; // number of ratings (a popularity proxy)
};

export type TrailerInfo = {
  url: string; // playable video URL
  preview: string; // poster image URL
};

// The rich, display-oriented fields the detail screen shows. All are pulled
// from the same DisplayCatalog `details` response as the price, so surfacing
// them costs no extra request.
export type TitleDetails = {
  developer: string;
  publisher: string;
  description: string; // full store description
  releaseDate: string; // ISO 8601, or ''
  ratingSystem: string; // e.g. "PEGI" (region-appropriate board)
  ratingLevel: string; // e.g. "18"
  heroImage: string; // wide key art URL, or ''
  screenshots: string[]; // screenshot URLs
  capabilities: string[]; // canonical capability ids (see CAPABILITY_MATCHERS)
  trailers: TrailerInfo[];
};

// Canonical capability id -> the raw DisplayCatalog Attribute names that imply
// it, in the order we want to show the chips. Kept here (not in the screen) so
// the mapping lives beside the API it parses.
const CAPABILITY_MATCHERS: Array<{id: string; attrs: string[]}> = [
  {id: 'single', attrs: ['SinglePlayer']},
  {id: 'multi', attrs: ['MultiPlayer']},
  {
    id: 'coop',
    attrs: [
      'CoOp',
      'Coop',
      'CoOperativeGaming',
      'LocalCoOp',
      'OnlineCoOp',
      'SharedSplitScreen',
    ],
  },
  {
    id: 'crossplat',
    attrs: ['CrossPlatformMultiPlayer', 'XblCrossPlatformMultiplayer'],
  },
  {id: 'optimized', attrs: ['ConsoleGen9Optimized', 'XboxConsoleGenOptimized']},
  {id: '4k', attrs: ['Capability4k', '4k', '4K']},
  {id: 'hdr', attrs: ['CapabilityHDR']},
  {id: 'dolbyvision', attrs: ['CapabilityDolbyVision']},
  {id: 'atmos', attrs: ['DolbyAtmos']},
  {id: 'dtsx', attrs: ['DTSX']},
  {id: 'spatial', attrs: ['SpatialSound']},
  {id: 'achievements', attrs: ['XblAchievements']},
  {id: 'cloudsaves', attrs: ['XblCloudSaves']},
];

// Preferred content-rating board per market; anything not listed falls back to
// the order in extractRatingBoard.
const MARKET_RATING_SYSTEM: Record<string, string> = {
  US: 'ESRB',
  CA: 'ESRB',
  MX: 'ESRB',
  AR: 'ESRB',
  CL: 'ESRB',
  CO: 'ESRB',
  BR: 'DJCTQ',
  JP: 'CERO',
  KR: 'GRB',
  TW: 'CSRR',
  AU: 'COB-AU',
  NZ: 'OFLC-NZ',
  DE: 'USK',
};

// Build the public Store page URL for a title. productId === StoreId for
// xCloud catalog titles, so no extra API call is needed.
export const getStoreUrl = (storeId: string): string =>
  `https://www.xbox.com/games/store/-/${storeId}`;

// Derive the pricing market + language. The market (which decides currency)
// should follow the user's Store region, so we prefer the device region and
// only fall back to the game-language's region, then US. The language param is
// used to localize titles and comes from the preferred game language.
export const deriveMarketLanguage = (
  preferredGameLanguage?: string,
  deviceRegion?: string,
): {market: string; language: string} => {
  const language = preferredGameLanguage || 'en-US';
  // DisplayCatalog's market must be an ISO 3166 alpha-2 country; drop anything
  // else (e.g. a UN M49 group like "419" from an es-419 device locale).
  const alpha2 = (region?: string): string =>
    region && /^[A-Za-z]{2}$/.test(region) ? region : '';
  const market = (
    alpha2(deviceRegion) ||
    alpha2(parseRegion(language)) ||
    'US'
  ).toUpperCase();
  return {market, language};
};

const parseAmount = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Pick the cheapest purchasable offer as the title's "starting" price.
// Availabilities whose Actions include "Purchase" and carry a positive
// ListPrice are real store offers; a discounted offer surfaces as a lower
// ListPrice than MSRP, and onSale/saleEnd are taken from that same offer.
export const extractPrice = (product: any): PriceInfo | null => {
  const skus = product?.DisplaySkuAvailabilities;
  if (!Array.isArray(skus)) {
    return null;
  }

  let best: {
    listPrice: number;
    msrp: number;
    currencyCode: string;
    endDate?: string;
  } | null = null;

  for (const sku of skus) {
    const availabilities = sku?.Availabilities;
    if (!Array.isArray(availabilities)) {
      continue;
    }
    for (const availability of availabilities) {
      const price = availability?.OrderManagementData?.Price;
      const actions = availability?.Actions;
      if (!price || !Array.isArray(actions) || !actions.includes('Purchase')) {
        continue;
      }
      const listPrice = parseAmount(price.ListPrice);
      if (listPrice <= 0) {
        continue;
      }
      const msrp = parseAmount(price.MSRP);
      if (!best || listPrice < best.listPrice) {
        best = {
          listPrice,
          msrp: msrp > 0 ? msrp : listPrice,
          currencyCode: price.CurrencyCode || price.WholesaleCurrencyCode || '',
          endDate: availability?.Conditions?.EndDate,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  const onSale = best.msrp > best.listPrice;
  return {
    listPrice: best.listPrice,
    msrp: best.msrp,
    currencyCode: best.currencyCode,
    onSale,
    saleEndDate: onSale ? best.endDate : undefined,
  };
};

// Store user rating from the same DisplayCatalog response as the price.
export const extractRating = (product: any): RatingInfo | null => {
  const usage = product?.MarketProperties?.[0]?.UsageData;
  if (!Array.isArray(usage)) {
    return null;
  }
  let best: RatingInfo | null = null;
  for (const u of usage) {
    const count = parseAmount(u?.RatingCount);
    const average = parseAmount(u?.AverageRating);
    // Need both a real score and a sample; a missing average parses to 0.
    if (count <= 0 || average <= 0) {
      continue;
    }
    // Prefer the AllTime aggregate; otherwise keep the largest sample.
    if (u?.AggregateTimeSpan === 'AllTime') {
      best = {average, count};
      break;
    }
    if (!best || count > best.count) {
      best = {average, count};
    }
  }
  return best;
};

// Normalize a DisplayCatalog image/video Uri, which comes back protocol-
// relative (leading "//"). Returns '' for anything unusable.
const absUri = (uri: any): string => {
  if (typeof uri !== 'string' || !uri) {
    return '';
  }
  if (uri.startsWith('//')) {
    return 'https:' + uri;
  }
  if (uri.startsWith('http')) {
    return uri;
  }
  return 'https://' + uri.replace(/^\/+/, '');
};

// Pick the region-appropriate content rating (e.g. "PEGO 18" in the EU,
// "ESRB M" in the US) from the many boards the API returns.
const extractRatingBoard = (
  product: any,
  market: string,
): {system: string; level: string} | null => {
  const list = product?.MarketProperties?.[0]?.ContentRatings;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const bySystem: Record<string, any> = {};
  for (const r of list) {
    if (r?.RatingSystem) {
      bySystem[r.RatingSystem] = r;
    }
  }
  const preferred = MARKET_RATING_SYSTEM[market];
  const order = [
    preferred,
    'PEGI',
    'ESRB',
    'USK',
    'IARC',
    list[0]?.RatingSystem,
  ];
  for (const sys of order) {
    const entry = sys && bySystem[sys];
    if (entry?.RatingId) {
      // RatingId is "SYSTEM:LEVEL", e.g. "PEGI:18".
      const level = String(entry.RatingId).split(':')[1] || '';
      return {system: entry.RatingSystem, level};
    }
  }
  return null;
};

// Extract the rich detail fields from a single DisplayCatalog product. Returns
// null only when the product is unusable.
export const extractDetails = (
  product: any,
  market = 'US',
): TitleDetails | null => {
  const lp = product?.LocalizedProperties?.[0];
  if (!lp) {
    return null;
  }

  const images: any[] = Array.isArray(lp.Images) ? lp.Images : [];
  const byPurpose = (purpose: string): string[] =>
    images
      .filter(im => im?.ImagePurpose === purpose)
      .map(im => absUri(im?.Uri))
      .filter(Boolean);
  const heroImage =
    byPurpose('SuperHeroArt')[0] || byPurpose('TitledHeroArt')[0] || '';
  const screenshots = byPurpose('Screenshot');

  const attrNames = new Set(
    (Array.isArray(product?.Properties?.Attributes)
      ? product.Properties.Attributes
      : []
    )
      .map((a: any) => a?.Name)
      .filter((n: any) => typeof n === 'string'),
  );
  const capabilities = CAPABILITY_MATCHERS.filter(m =>
    m.attrs.some(a => attrNames.has(a)),
  ).map(m => m.id);

  const videos: any[] = Array.isArray(lp.Videos) ? lp.Videos : [];
  const trailers: TrailerInfo[] = videos
    .map(v => ({url: absUri(v?.Uri), preview: absUri(v?.PreviewImage?.Uri)}))
    .filter(t => t.url);

  const board = extractRatingBoard(product, market);

  return {
    developer: lp.DeveloperName || '',
    publisher: lp.PublisherName || '',
    description: lp.ProductDescription || lp.ShortDescription || '',
    releaseDate: product?.MarketProperties?.[0]?.OriginalReleaseDate || '',
    ratingSystem: board?.system || '',
    ratingLevel: board?.level || '',
    heroImage,
    screenshots,
    capabilities,
    trailers,
  };
};

export type FetchPricesResult = {
  // Prices keyed by canonical uppercase Store id; ids without a purchasable
  // price are omitted.
  prices: Record<string, PriceInfo>;
  // Store ratings keyed by the same uppercase Store id.
  ratings: Record<string, RatingInfo>;
  // true only when every batch responded, so callers can tell "this market
  // genuinely has no store prices" from "the network failed" and retry.
  ok: boolean;
};

// Fetch prices for many Store ids, batched concurrently. Never rejects — a
// failed batch contributes nothing and flips `ok` to false.
export const fetchPrices = async (
  storeIds: string[],
  market = 'US',
  language = 'en-US',
): Promise<FetchPricesResult> => {
  const ids = Array.from(
    new Set((storeIds || []).filter(id => typeof id === 'string' && id)),
  );
  const prices: Record<string, PriceInfo> = {};
  const ratings: Record<string, RatingInfo> = {};

  if (ids.length === 0) {
    return {prices, ratings, ok: true};
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  let ok = true;
  await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await axios.get(CATALOG_URL, {
          params: {
            bigIds: chunk.join(','),
            market,
            languages: language,
            fieldsTemplate: 'details',
          },
          headers: {'MS-CV': '0'},
          timeout: 15000,
        });
        const products = res?.data?.Products;
        if (Array.isArray(products)) {
          products.forEach((product: any) => {
            if (!product?.ProductId) {
              return;
            }
            // Key by the canonical uppercase big-id so lookups are case-safe.
            const key = String(product.ProductId).toUpperCase();
            const info = extractPrice(product);
            if (info) {
              prices[key] = info;
            }
            const rating = extractRating(product);
            if (rating) {
              ratings[key] = rating;
            }
          });
        }
      } catch (e) {
        ok = false;
        log.info('fetchPrices batch failed:', e);
      }
    }),
  );

  return {prices, ratings, ok};
};

export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// fetchPrices, retrying the whole request (with backoff) while a batch fails.
// Resolves with the last result; ok is false only if every attempt had a
// failed batch. Callers apply the prices and, on ok:false, may refetch later.
// Pass isCancelled to stop the retry chain early (e.g. after navigating away).
export const fetchPricesWithRetry = async (
  storeIds: string[],
  market = 'US',
  language = 'en-US',
  {
    attempts = 3,
    baseDelayMs = 15000,
    isCancelled,
  }: {
    attempts?: number;
    baseDelayMs?: number;
    isCancelled?: () => boolean;
  } = {},
): Promise<FetchPricesResult> => {
  let result = await fetchPrices(storeIds, market, language);
  for (let attempt = 1; !result.ok && attempt < attempts; attempt++) {
    if (isCancelled?.()) {
      break;
    }
    await delay(baseDelayMs * Math.pow(2, attempt - 1));
    if (isCancelled?.()) {
      break;
    }
    result = await fetchPrices(storeIds, market, language);
  }
  return result;
};

export type FetchTitleDetailsResult = {
  price: PriceInfo | null;
  rating: RatingInfo | null;
  details: TitleDetails | null;
  ok: boolean; // false only when the request failed (so callers can retry)
};

// Fetch one title's full detail (price + rating + rich fields) in a single
// DisplayCatalog call. Used by the detail screen; the list keeps fetching just
// price/rating in bulk so its cache stays small. Retries with backoff.
export const fetchTitleDetails = async (
  storeId: string,
  market = 'US',
  language = 'en-US',
  {
    attempts = 3,
    baseDelayMs = 15000,
    isCancelled,
  }: {
    attempts?: number;
    baseDelayMs?: number;
    isCancelled?: () => boolean;
  } = {},
): Promise<FetchTitleDetailsResult> => {
  const empty: FetchTitleDetailsResult = {
    price: null,
    rating: null,
    details: null,
    ok: false,
  };
  if (!storeId) {
    return {...empty, ok: true};
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (isCancelled?.()) {
      break;
    }
    try {
      const res = await axios.get(CATALOG_URL, {
        params: {
          bigIds: storeId,
          market,
          languages: language,
          fieldsTemplate: 'details',
        },
        headers: {'MS-CV': '0'},
        timeout: 15000,
      });
      const product = res?.data?.Products?.[0];
      if (!product) {
        // A valid "no such product" response — nothing to retry.
        return {...empty, ok: true};
      }
      return {
        price: extractPrice(product),
        rating: extractRating(product),
        details: extractDetails(product, market),
        ok: true,
      };
    } catch (e) {
      log.info('fetchTitleDetails failed:', e);
      if (attempt < attempts - 1 && !isCancelled?.()) {
        await delay(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  return empty;
};

// Look up a price by Store id, tolerant of id case differences.
export const getPrice = (
  map: Record<string, PriceInfo> | null | undefined,
  storeId: string | null | undefined,
): PriceInfo | null => {
  if (!map || !storeId) {
    return null;
  }
  return map[storeId] || map[String(storeId).toUpperCase()] || null;
};

// Format an amount for display, e.g. 7750 JPY -> "¥7,750", 19.99 USD -> "$19.99".
// Deterministic (so the list and detail always agree) and independent of the
// runtime's Intl support: known currencies get their symbol, others fall back
// to a readable "<amount> <CODE>".
export const formatPrice = (amount: number, currencyCode: string): string => {
  if (!Number.isFinite(amount)) {
    return '';
  }
  let decimals = 2;
  if (ZERO_DECIMAL_CURRENCIES.includes(currencyCode)) {
    decimals = 0;
  } else if (THREE_DECIMAL_CURRENCIES.includes(currencyCode)) {
    decimals = 3;
  }
  const fixed = amount.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = decPart ? `${grouped}.${decPart}` : grouped;
  const symbol = CURRENCY_SYMBOLS[currencyCode];
  if (symbol) {
    return `${symbol}${number}`;
  }
  return currencyCode ? `${number} ${currencyCode}` : number;
};

// Discount percent as a positive integer (e.g. 50 for 50% off).
export const discountPercent = (info: PriceInfo): number => {
  if (!info.onSale || info.msrp <= 0) {
    return 0;
  }
  return Math.round((1 - info.listPrice / info.msrp) * 100);
};

// The canonical "counts as on sale for display/filtering" rule: on sale with a
// discount that rounds to at least 1%, so a sub-1% price isn't shown struck.
export const isSaleForDisplay = (info?: PriceInfo | null): boolean =>
  !!info?.onSale && discountPercent(info) > 0;

// A short, human sale-end label ("~ 8/24"), or empty when there's no usable
// date. Guards against the API's far-future sentinel dates.
export const formatSaleEnd = (info: PriceInfo, locale?: string): string => {
  if (!info.onSale || !info.saleEndDate) {
    return '';
  }
  // DisplayCatalog returns .NET timestamps with up to 7 fractional-second
  // digits, which some engines reject; trim to milliseconds before parsing.
  let normalized = info.saleEndDate.replace(/(\.\d{3})\d+(?=Z|[+-]|$)/, '$1');
  // Treat a zone-less timestamp as UTC so the UTC calendar day below is right.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }
  const end = new Date(normalized);
  const time = end.getTime();
  if (!Number.isFinite(time)) {
    return '';
  }
  const now = Date.now();
  // Ignore already-passed windows and the year-9999 "always available" marker.
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (time <= now || time - now > oneYear) {
    return '';
  }
  // Format in the app locale (so day/month order is right) but pinned to UTC,
  // matching the store's sale window boundary. Fall back to a numeric M/D when
  // Intl date formatting isn't available.
  try {
    const formatted = new Intl.DateTimeFormat(locale || undefined, {
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(end);
    if (formatted) {
      return formatted;
    }
  } catch (e) {
    // Intl unavailable — fall through to the numeric format.
  }
  const month = end.getUTCMonth() + 1;
  const day = end.getUTCDate();
  return `${month}/${day}`;
};
