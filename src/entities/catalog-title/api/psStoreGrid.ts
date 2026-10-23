import axios from 'axios';
import {debugFactory} from '../../../shared/lib/debug';
import {runPool} from '../../../shared/lib/pool';
import {getPsStoreLocale} from './psStoreLocale';
import {normalizeTitle} from './gfnCatalog';

const log = debugFactory('psStoreGrid');

// store.playstation.com's unauthenticated GraphQL endpoint and its category
// grid operation (the one backing its own category pages). Same fragility
// note as psStorePrice.ts: the persisted-query hash is a browser-session
// artifact Sony can rotate, and the category id is content-managed -- a
// sudden empty/failing response means a fresh value is needed from a real
// store.playstation.com session.
export const PS_GRAPHQL_URL =
  'https://web.np.playstation.com/api/graphql/v1/op';
export const PS_OP_CATEGORY_GRID = 'categoryGridRetrieve';
export const PS_HASH_CATEGORY_GRID =
  '4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35';
// "All PS5 games" (cat.gma.x_All_PS5_games), verified live.
export const PS5_GAMES_CATEGORY_ID = '4cbf39e2-5749-4970-ba81-93a489e4570c';

const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 3;
// Report partial results this often (in pages) so sale badges start showing
// before the whole crawl (~80 pages) is done.
const PARTIAL_EVERY_PAGES = 20;

// Sale percent per title, keyed by store product id and by normalized name
// (the Plus catalog's ids don't always equal the category's).
export type PsSaleMap = Record<string, number>;

const nameKey = (name: string): string => `n:${normalizeTitle(name)}`;

const percentOf = (text?: string | null): number => {
  const match = text ? /(\d+)\s*%/.exec(text) : null;
  return match ? parseInt(match[1], 10) : 0;
};

// The grid's per-product `price` already carries the public sale
// (`discountText`, e.g. "-30%") and, for PS Plus members, a single upsell
// whose text names a plain discount ("10%オフ"). "さらにN%オフ" ("N% more")
// only stacks on a public sale, so the public percent stays the headline.
export const gridProductSale = (price: any): number => {
  const pub = percentOf(price?.discountText);
  if (pub > 0) {
    return pub;
  }
  const branding: unknown = price?.upsellServiceBranding;
  const plus = Array.isArray(branding) && branding.includes('PS_PLUS');
  return plus ? percentOf(price?.upsellText) : 0;
};

export const addGridPageSales = (sales: PsSaleMap, products: any[]) => {
  products.forEach(p => {
    const percent = gridProductSale(p?.price);
    if (percent <= 0 || typeof p?.id !== 'string') {
      return;
    }
    sales[p.id] = Math.max(sales[p.id] ?? 0, percent);
    if (typeof p?.name === 'string') {
      const key = nameKey(p.name);
      sales[key] = Math.max(sales[key] ?? 0, percent);
    }
  });
};

// Best sale percent for a Plus-catalog game, by any of its ids or its name.
export const lookupPsSale = (
  sales: PsSaleMap,
  game: {productId?: string; storeProductId?: string; name?: string},
): number =>
  Math.max(
    (game.productId && sales[game.productId]) || 0,
    (game.storeProductId && sales[game.storeProductId]) || 0,
    (game.name && sales[nameKey(game.name)]) || 0,
  );

const requestPage = async (offset: number) => {
  const res = await axios.get(PS_GRAPHQL_URL, {
    params: {
      operationName: PS_OP_CATEGORY_GRID,
      variables: JSON.stringify({
        id: PS5_GAMES_CATEGORY_ID,
        pageArgs: {size: PAGE_SIZE, offset},
        sortBy: {name: 'sales30', isAscending: false},
        filterBy: [],
        facetOptions: [],
      }),
      extensions: JSON.stringify({
        persistedQuery: {version: 1, sha256Hash: PS_HASH_CATEGORY_GRID},
      }),
    },
    headers: {
      Accept: 'application/json',
      'x-psn-store-locale-override': getPsStoreLocale(),
      'x-apollo-operation-name': PS_OP_CATEGORY_GRID,
    },
    timeout: 20000,
  });
  const grid = res?.data?.data?.categoryGridRetrieve;
  return {
    products: Array.isArray(grid?.products) ? (grid.products as any[]) : [],
    totalCount: Number(grid?.pageInfo?.totalCount) || 0,
  };
};

export type PsSaleCrawl = {
  sales: PsSaleMap;
  // True only when every page was read, so a partial result is not cached as
  // a day's worth of data.
  complete: boolean;
};

// Reads the whole "All PS5 games" category once (~80 pages of 100) and keeps
// only the discounted titles. There is no discount filter or batch lookup on
// this API, and the per-title pricing operation takes a single concept id, so
// this is the cheapest complete sale source. `onPartial` receives a snapshot
// every few pages. Never rejects.
export const fetchPsStoreSales = async (
  onPartial?: (sales: PsSaleMap) => void,
): Promise<PsSaleCrawl> => {
  const sales: PsSaleMap = {};
  let first;
  try {
    first = await requestPage(0);
  } catch (e) {
    log.info('fetchPsStoreSales first page failed:', e);
    return {sales, complete: false};
  }
  addGridPageSales(sales, first.products);

  const offsets: number[] = [];
  for (let o = PAGE_SIZE; o < first.totalCount; o += PAGE_SIZE) {
    offsets.push(o);
  }
  let failed = first.products.length === 0;
  let done = 0;
  await runPool(offsets, PAGE_CONCURRENCY, async offset => {
    try {
      addGridPageSales(sales, (await requestPage(offset)).products);
    } catch (e) {
      failed = true;
      log.info('fetchPsStoreSales page failed:', e);
    }
    done++;
    if (onPartial && done % PARTIAL_EVERY_PAGES === 0) {
      onPartial({...sales});
    }
  });
  return {sales, complete: !failed};
};
