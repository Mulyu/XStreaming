import axios from 'axios';
import {debugFactory} from './debug';

const log = debugFactory('storePrice');

// Microsoft Store DisplayCatalog. Public, no auth required. Prices are not
// included in the Game Pass catalog response, so we fetch them here keyed by
// the Store "big id" (which, for xCloud titles, equals the productId).
const CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';

// The API accepts many ids per request (verified with 400+ in one call); we
// still chunk conservatively so a single oversized URL can't fail the batch.
const BATCH_SIZE = 100;

// Currencies that are conventionally written without minor units.
const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'CLP', 'VND', 'HUF', 'ISK'];

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
  BRL: 'R$',
  INR: '₹',
  RUB: '₽',
  MXN: 'MX$',
};

export type PriceInfo = {
  listPrice: number; // current buyable price (already reflects any discount)
  msrp: number; // original price
  currencyCode: string;
  onSale: boolean;
  saleEndDate?: string; // ISO string, only present while on sale
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
  const languageRegion = language.split('-')[1];
  const market = (deviceRegion || languageRegion || 'US').toUpperCase();
  return {market, language};
};

const parseAmount = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Pick the cheapest purchasable price for the base game. Availabilities whose
// Actions include "Purchase" and carry a positive ListPrice are real store
// offers; a discounted offer surfaces as a lower ListPrice than MSRP.
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

// Fetch prices for many Store ids, batched. Resolves to a map keyed by
// productId; ids without a purchasable price are simply omitted. Never
// rejects — a failed batch just contributes nothing.
export const fetchPrices = async (
  storeIds: string[],
  market = 'US',
  language = 'en-US',
): Promise<Record<string, PriceInfo>> => {
  const ids = Array.from(
    new Set((storeIds || []).filter(id => typeof id === 'string' && id)),
  );
  const result: Record<string, PriceInfo> = {};

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
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
          const info = extractPrice(product);
          if (info && product?.ProductId) {
            // Key by the canonical uppercase big-id so lookups are case-safe.
            result[String(product.ProductId).toUpperCase()] = info;
          }
        });
      }
    } catch (e) {
      log.info('fetchPrices batch failed:', e);
    }
  }

  return result;
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

// Manual formatter used when Intl currency formatting is unavailable.
const formatPriceManual = (amount: number, currencyCode: string): string => {
  const zeroDecimal = ZERO_DECIMAL_CURRENCIES.includes(currencyCode);
  const fixed = zeroDecimal ? Math.round(amount).toString() : amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = decPart ? `${grouped}.${decPart}` : grouped;
  const symbol = CURRENCY_SYMBOLS[currencyCode];
  if (symbol) {
    return `${symbol}${number}`;
  }
  return currencyCode ? `${number} ${currencyCode}` : number;
};

// Format an amount for display, e.g. 7750 JPY -> "¥7,750", 19.99 USD -> "$19.99".
// Prefer Intl.NumberFormat (correct symbol placement, minor units and grouping
// for every currency) and fall back to a manual formatter where the runtime's
// Intl lacks currency support.
export const formatPrice = (amount: number, currencyCode: string): string => {
  if (!Number.isFinite(amount)) {
    return '';
  }
  if (currencyCode) {
    try {
      const formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
      });
      const formatted = formatter.format(amount);
      // Some Hermes builds return the raw number without a currency marker;
      // fall through to the manual formatter when that happens.
      if (formatted && /[^\d.,\s]/.test(formatted)) {
        return formatted;
      }
    } catch (e) {
      // Intl currency support missing — use the manual formatter below.
    }
  }
  return formatPriceManual(amount, currencyCode);
};

// Discount percent as a positive integer (e.g. 50 for 50% off).
export const discountPercent = (info: PriceInfo): number => {
  if (!info.onSale || info.msrp <= 0) {
    return 0;
  }
  return Math.round((1 - info.listPrice / info.msrp) * 100);
};

// A short, human sale-end label ("~ 8/24"), or empty when there's no usable
// date. Guards against the API's far-future sentinel dates.
export const formatSaleEnd = (info: PriceInfo): string => {
  if (!info.onSale || !info.saleEndDate) {
    return '';
  }
  const end = new Date(info.saleEndDate);
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
  const month = end.getMonth() + 1;
  const day = end.getDate();
  return `${month}/${day}`;
};
