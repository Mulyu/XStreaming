import axios from 'axios';
import {debugFactory} from '../../../shared/lib/debug';
import {getPsStoreLocale, getPsStoreUrlSlug} from './psStoreLocale';

const log = debugFactory('psStorePrice');

// store.playstation.com's own web client's GraphQL endpoint. Confirmed live:
// no auth/cookie needed at all for storefront price/catalog data (the
// npsso->OAuth token exchange this app's PS Plus login already does is for a
// *different*, account-scoped PSN API surface -- trophies/profile/owned-games
// -- not this one). GET with the query's `operationName`/`variables`/
// `extensions` as query-string params, same shape store.playstation.com's own
// page uses.
const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';

// Persisted-query ids Sony's backend has cached server-side from a real
// browser session -- not secrets, but not permanent either: unlike Steam's
// appdetails API or Xbox's DisplayCatalog (both stable, documented-shape
// public APIs), Sony can rotate/invalidate a hash at any time, at which point
// this specific operation starts failing until someone recaptures a fresh
// hash from the Network tab of a real store.playstation.com session. Treat
// this the same risk class as the Steam HTML scraper in steamCharts.ts
// breaking on a markup change -- a config value to refresh, not a rebuild.
const OP_PRICING_BY_CONCEPT_ID = 'metGetPricingDataByConceptId';
const HASH_PRICING_BY_CONCEPT_ID =
  'abcb311ea830e679fe2b697a27f755764535d825b24510ab1239a4ca3092bd09';

export type PsStorePurchasePrice = {
  // Sony's own locale-formatted display strings (e.g. "$9.99", "¥1,210") --
  // used as-is rather than reparsed, since PS Store prices span currencies
  // with different minor-unit conventions (JPY has none) that Sony has
  // already rendered correctly.
  basePrice: string;
  discountedPrice: string;
  discountPercent: number; // 0 when not on sale
  isFree: boolean;
  // Epoch ms the current sale ends, when Sony reports one.
  saleEndsAt?: number;
};

export type PsStoreTrial = {
  // Length of the PS Plus Premium game trial, when its (localized) upsell
  // text states one -- the text is Sony's, so this is best-effort.
  minutes?: number;
};

export type PsStorePriceInfo = {
  // Null for a title with nothing to buy outright (PS Plus-exclusive).
  purchase: PsStorePurchasePrice | null;
  // Null when the title has no PS Plus game trial.
  trial: PsStoreTrial | null;
};

type RawCta = {
  type?: string;
  meta?: {upSellService?: string};
  price?: {
    basePrice?: string;
    discountedPrice?: string;
    discountText?: string | null;
    endTime?: number | string | null;
    isFree?: boolean;
    isTiedToSubscription?: boolean;
    upsellText?: string | null;
  };
};

const parseDiscountPercent = (discountText?: string | null): number => {
  if (!discountText) {
    return 0;
  }
  const match = /(\d+)\s*%/.exec(discountText);
  return match ? parseInt(match[1], 10) : 0;
};

// A concept can carry more than one purchase CTA -- a PS Plus-tied "Game
// Trial"/discount alongside the standalone purchase price, confirmed live
// (concept 10017168: one CTA with upSellService "PS_PLUS" priced as a free
// trial, one with "NONE" priced at the real $9.99/¥1,210 purchase price).
// This picks the plain, no-subscription-required purchase price -- the same
// thing Steam/Xbox's price fields already mean here -- and falls back to
// whatever's available if every CTA turns out subscription-tied.
const pickPurchaseCta = (ctas: RawCta[]): RawCta | undefined =>
  ctas.find(c => c.meta?.upSellService === 'NONE') ??
  ctas.find(c => !c.price?.isTiedToSubscription);

const findTrialCta = (ctas: RawCta[]): RawCta | undefined =>
  ctas.find(c => /TRIAL/i.test(c.type ?? ''));

// "2時間の製品版ゲームトライアルを..." / "0.5時間の..." / "a 2-hour ..." /
// "30分の..." -- Sony localizes the sentence, so only the common unit words
// are understood; anything else leaves the length unknown.
const parseTrialMinutes = (text?: string | null): number | undefined => {
  if (!text) {
    return undefined;
  }
  const hours = /(\d+(?:\.\d+)?)\s*(?:時間|-?\s*hours?\b|-?\s*hrs?\b)/i.exec(
    text,
  );
  if (hours) {
    return Math.round(parseFloat(hours[1]) * 60);
  }
  const minutes = /(\d+)\s*(?:分|-?\s*minutes?\b|-?\s*mins?\b)/i.exec(text);
  return minutes ? parseInt(minutes[1], 10) : undefined;
};

export const parsePsStoreCtas = (ctas: RawCta[]): PsStorePriceInfo => {
  const price = pickPurchaseCta(ctas)?.price;
  const trialCta = findTrialCta(ctas);
  const endTime = Number(price?.endTime);
  return {
    purchase:
      price?.basePrice && price?.discountedPrice
        ? {
            basePrice: price.basePrice,
            discountedPrice: price.discountedPrice,
            discountPercent: parseDiscountPercent(price.discountText),
            isFree: !!price.isFree,
            saleEndsAt:
              Number.isFinite(endTime) && endTime > 0 ? endTime : undefined,
          }
        : null,
    trial: trialCta
      ? {minutes: parseTrialMinutes(trialCta.price?.upsellText)}
      : null,
  };
};

// One request for one concept. Resolves to null when the request itself
// failed (so callers can retry later) and to a possibly empty info when Sony
// answered.
const requestPsStorePrice = async (
  conceptId: string,
): Promise<PsStorePriceInfo | null> => {
  try {
    const res = await axios.get(GRAPHQL_URL, {
      params: {
        operationName: OP_PRICING_BY_CONCEPT_ID,
        variables: JSON.stringify({conceptId}),
        extensions: JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: HASH_PRICING_BY_CONCEPT_ID,
          },
        }),
      },
      headers: {
        Accept: 'application/json',
        'x-psn-store-locale-override': getPsStoreLocale(),
        // Required -- an unauthenticated GraphQL GET without this (or a
        // non-form content-type) is rejected as a potential CSRF attempt,
        // confirmed live against the real endpoint.
        'x-apollo-operation-name': OP_PRICING_BY_CONCEPT_ID,
      },
      timeout: 15000,
    });
    const product = res?.data?.data?.conceptRetrieve?.defaultProduct;
    if (!product) {
      return null;
    }
    return parsePsStoreCtas(product.mobilectas ?? []);
  } catch (e) {
    log.info('requestPsStorePrice failed:', e);
    return null;
  }
};

// Fetch the purchase price and game-trial availability for one PS Store
// concept (CatalogGame's own `conceptId`, the region-agnostic id -- unlike
// `storeProductId`, which is region-prefixed). Returns null on any failure.
export const fetchPsStorePrice = async (
  conceptId: string,
): Promise<PsStorePriceInfo | null> =>
  conceptId ? requestPsStorePrice(conceptId) : null;

// How many concept requests run at once for a whole-catalog fetch -- same
// reasoning as steamPrice.ts's own cap.
const BATCH_CONCURRENCY = 4;

// Fetch many concepts through a small worker pool. `onResult` fires per
// concept as each one lands (failed requests are skipped, not reported), so
// the caller can batch its own state updates. Never rejects.
export const fetchPsStorePrices = async (
  conceptIds: string[],
  onResult: (conceptId: string, info: PsStorePriceInfo) => void,
): Promise<void> => {
  const ids = Array.from(new Set(conceptIds.filter(Boolean)));
  let next = 0;
  const workers = Array.from(
    {length: Math.min(BATCH_CONCURRENCY, ids.length)},
    async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const info = await requestPsStorePrice(id);
        if (info) {
          onResult(id, info);
        }
      }
    },
  );
  await Promise.all(workers);
};

export const isPsStoreSaleForDisplay = (
  info?: PsStorePriceInfo | null,
): boolean => !!info?.purchase && info.purchase.discountPercent > 0;

// store.playstation.com's own product/concept page. Prefers the
// region-agnostic conceptId (works from any store region); productId is
// region-prefixed (UP.../EP...) so it's only valid as a fallback when no
// conceptId is known yet.
export const getPsStoreUrl = (
  conceptId?: string,
  productId?: string,
): string | null => {
  const locale = getPsStoreUrlSlug();
  if (conceptId) {
    return `https://store.playstation.com/${locale}/concept/${conceptId}`;
  }
  if (productId) {
    return `https://store.playstation.com/${locale}/product/${productId}`;
  }
  return null;
};
