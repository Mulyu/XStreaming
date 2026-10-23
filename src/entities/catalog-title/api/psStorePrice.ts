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
  // True when the sale price is the PS Plus members' discount, not a public
  // sale.
  memberPrice?: boolean;
};

export type PsStorePriceInfo = {
  // Null for a title with nothing to buy outright (PS Plus-exclusive).
  purchase: PsStorePurchasePrice | null;
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
  };
};

const parseDiscountPercent = (discountText?: string | null): number => {
  if (!discountText) {
    return 0;
  }
  const match = /(\d+)\s*%/.exec(discountText);
  return match ? parseInt(match[1], 10) : 0;
};

// A concept can carry several CTAs side by side (confirmed live): a PS Plus
// game trial, the plain purchase ("ADD_TO_CART"/"PREORDER", service NONE), a
// PS Plus member discount ("UPSELL_PS_PLUS_DISCOUNT") and, for EA titles, an
// EA Play trial or a demo download. Only the purchase ones are prices.
const isTrialType = (c: RawCta): boolean => /TRIAL/i.test(c.type ?? '');

// The plain, no-subscription-required purchase price -- the same thing
// Steam/Xbox's price fields mean here.
const pickPurchaseCta = (ctas: RawCta[]): RawCta | undefined => {
  const candidates = ctas.filter(
    c => !isTrialType(c) && !/^UPSELL_/.test(c.type ?? ''),
  );
  return (
    candidates.find(c => c.meta?.upSellService === 'NONE') ??
    candidates.find(c => !c.price?.isTiedToSubscription)
  );
};

const findMemberDiscountCta = (ctas: RawCta[]): RawCta | undefined =>
  ctas.find(c => c.type === 'UPSELL_PS_PLUS_DISCOUNT');

const toEndTime = (value?: number | string | null): number | undefined => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
};

export const parsePsStoreCtas = (ctas: RawCta[]): PsStorePriceInfo => {
  const price = pickPurchaseCta(ctas)?.price;
  const member = findMemberDiscountCta(ctas)?.price;

  let purchase: PsStorePurchasePrice | null = null;
  if (price?.basePrice && price?.discountedPrice) {
    purchase = {
      basePrice: price.basePrice,
      discountedPrice: price.discountedPrice,
      discountPercent: parseDiscountPercent(price.discountText),
      isFree: !!price.isFree,
      saleEndsAt: toEndTime(price.endTime),
    };
  }
  // The PS Plus member price wins when it is the deeper discount (or the
  // only one) -- the account this app signs in with is a PS Plus one.
  const memberPercent = parseDiscountPercent(member?.discountText);
  if (
    member?.basePrice &&
    member?.discountedPrice &&
    memberPercent > (purchase?.discountPercent ?? 0)
  ) {
    purchase = {
      basePrice: purchase?.basePrice ?? member.basePrice,
      discountedPrice: member.discountedPrice,
      discountPercent: memberPercent,
      isFree: !!member.isFree,
      saleEndsAt: toEndTime(member.endTime),
      memberPrice: true,
    };
  }

  return {purchase};
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

// Fetch the purchase price (and sale end) for one PS Store concept (CatalogGame's own `conceptId`, the region-agnostic id -- unlike
// `storeProductId`, which is region-prefixed). Returns null on any failure.
export const fetchPsStorePrice = async (
  conceptId: string,
): Promise<PsStorePriceInfo | null> =>
  conceptId ? requestPsStorePrice(conceptId) : null;

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
