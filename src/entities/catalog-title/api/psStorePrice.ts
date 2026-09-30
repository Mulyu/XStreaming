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

export type PsStorePriceInfo = {
  // Sony's own locale-formatted display strings (e.g. "$9.99", "¥1,210") --
  // used as-is rather than reparsed, since PS Store prices span currencies
  // with different minor-unit conventions (JPY has none) that Sony has
  // already rendered correctly.
  basePrice: string;
  discountedPrice: string;
  discountPercent: number; // 0 when not on sale
  isFree: boolean;
};

type RawCta = {
  meta?: {upSellService?: string};
  price?: {
    basePrice?: string;
    discountedPrice?: string;
    discountText?: string | null;
    isFree?: boolean;
    isTiedToSubscription?: boolean;
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
  ctas.find(c => !c.price?.isTiedToSubscription) ??
  ctas[0];

// Fetch the purchase price for one PS Store concept (CatalogGame's own
// `conceptId`, the region-agnostic id -- unlike `storeProductId`, which is
// region-prefixed). Returns null on any failure, or when the concept has no
// standalone purchase CTA at all (PS Plus-exclusive titles with nothing to
// buy outright).
export const fetchPsStorePrice = async (
  conceptId: string,
): Promise<PsStorePriceInfo | null> => {
  if (!conceptId) {
    return null;
  }
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
    const ctas: RawCta[] =
      res?.data?.data?.conceptRetrieve?.defaultProduct?.mobilectas ?? [];
    const cta = pickPurchaseCta(ctas);
    const price = cta?.price;
    if (!price?.basePrice || !price?.discountedPrice) {
      return null;
    }
    return {
      basePrice: price.basePrice,
      discountedPrice: price.discountedPrice,
      discountPercent: parseDiscountPercent(price.discountText),
      isFree: !!price.isFree,
    };
  } catch (e) {
    log.info('fetchPsStorePrice failed:', e);
    return null;
  }
};

export const isPsStoreSaleForDisplay = (
  info?: PsStorePriceInfo | null,
): boolean => !!info && info.discountPercent > 0;

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
