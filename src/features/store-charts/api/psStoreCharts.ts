// PS Store charts. store.playstation.com's own web client calls an
// unauthenticated GraphQL API (confirmed live, same endpoint
// entities/catalog-title/api/psStorePrice.ts uses for per-title pricing) whose
// `categoryGridRetrieve` operation backs its own category pages (Top Sellers,
// New Releases, ...) -- the direct PS Store analog of Steam's
// store/search/results scrape this feature already does for steamCharts.ts,
// just JSON instead of an HTML fragment.
import axios from 'axios';
import {storage} from '../../../shared/lib/mmkv';
import {debugFactory} from '../../../shared/lib/debug';
import {getPsStoreLocale} from '../../../entities/catalog-title';

const log = debugFactory('psStoreCharts');

const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';
const OP_CATEGORY_GRID = 'categoryGridRetrieve';
// Same fragility note as psStorePrice.ts's own hash constant: a browser-
// session artifact Sony's backend caches server-side, not a stable
// documented API shape -- treat a sudden empty/failing response as "this
// needs a fresh hash from a real store.playstation.com session's Network
// tab", the same maintenance Steam's HTML scraper occasionally needs too.
const HASH_CATEGORY_GRID =
  '4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35';

// "All PS5 games" -- confirmed live via this category's own
// `localizedName`/`reportingName` fields (cat.gma.x_All_PS5_games /
// WM_EU_PS5_ALL_GAMES). Content-managed, like the persisted-query hash
// above -- can go stale (the deals/SALES category id a reference PHP client
// hardcodes returned totalCount 0 when tried live during this feature's own
// research), so this one specific id is what's actually been verified, not
// a guaranteed-permanent constant.
const PS5_GAMES_CATEGORY_ID = '4cbf39e2-5749-4970-ba81-93a489e4570c';

export type PsStoreChartKind = 'topsellers' | 'new';

export type PsStoreChartEntry = {
  productId: string;
  title: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  discountPercent?: number;
};

export type PsStoreChartPage = {
  entries: PsStoreChartEntry[];
  totalCount?: number;
};

const cacheKey = (kind: PsStoreChartKind, locale: string): string =>
  `store.psStoreChart.${kind}.${locale}`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h, same as the Steam/Xbox chart caches

export const PS_STORE_CHART_PAGE_SIZE = 50;

const IMAGE_ROLE_PRIORITY = [
  'GAMEHUB_COVER_ART',
  'FOUR_BY_THREE_BANNER',
  'SIXTEEN_BY_NINE_BANNER',
  'MASTER',
];

const firstImage = (media: any[]): string | undefined => {
  for (const role of IMAGE_ROLE_PRIORITY) {
    const hit = media?.find(m => m?.role === role && m?.type === 'IMAGE');
    if (hit?.url) {
      return hit.url;
    }
  }
  return media?.find(m => m?.type === 'IMAGE')?.url;
};

const parseDiscountPercent = (discountText?: string | null): number => {
  if (!discountText) {
    return 0;
  }
  const match = /(\d+)\s*%/.exec(discountText);
  return match ? parseInt(match[1], 10) : 0;
};

const sortByForKind = (kind: PsStoreChartKind) =>
  kind === 'topsellers'
    ? {name: 'sales30', isAscending: false}
    : {name: 'productReleaseDate', isAscending: false};

export const getFreshPsStoreChart = (
  kind: PsStoreChartKind,
  locale: string,
): PsStoreChartEntry[] | null => {
  const raw = storage.getString(cacheKey(kind, locale));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.entries) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < CACHE_TTL_MS
    ) {
      return parsed.entries as PsStoreChartEntry[];
    }
  } catch {}
  return null;
};

// Fetch one page of the PS Store's "All PS5 games" category, sorted the same
// way its own Top Sellers ("topsellers" -> sales30 desc) or New Releases
// ("new" -> productReleaseDate desc) tab would be. Returns [] on any
// failure -- never rejects, same contract as fetchSteamChart/fetchXboxBrowsePage.
export const fetchPsStoreChart = async (
  kind: PsStoreChartKind,
  offset = 0,
  size = PS_STORE_CHART_PAGE_SIZE,
): Promise<PsStoreChartPage> => {
  const locale = getPsStoreLocale();
  let res;
  try {
    res = await axios.get(GRAPHQL_URL, {
      params: {
        operationName: OP_CATEGORY_GRID,
        variables: JSON.stringify({
          id: PS5_GAMES_CATEGORY_ID,
          pageArgs: {size, offset},
          sortBy: sortByForKind(kind),
          filterBy: [],
          facetOptions: [],
        }),
        extensions: JSON.stringify({
          persistedQuery: {version: 1, sha256Hash: HASH_CATEGORY_GRID},
        }),
      },
      headers: {
        Accept: 'application/json',
        'x-psn-store-locale-override': locale,
        'x-apollo-operation-name': OP_CATEGORY_GRID,
      },
      timeout: 15000,
    });
  } catch (e) {
    log.info('fetchPsStoreChart failed:', e);
    return {entries: []};
  }

  const grid = res?.data?.data?.categoryGridRetrieve;
  const products: any[] = Array.isArray(grid?.products) ? grid.products : [];
  const entries: PsStoreChartEntry[] = products
    .filter(p => typeof p?.id === 'string' && typeof p?.name === 'string')
    .map(p => ({
      productId: p.id,
      title: p.name,
      imageUrl: firstImage(p.media),
      price: p.price?.discountedPrice ?? undefined,
      originalPrice:
        p.price?.discountText && p.price?.basePrice
          ? p.price.basePrice
          : undefined,
      discountPercent: parseDiscountPercent(p.price?.discountText),
    }));

  if (offset === 0 && entries.length > 0) {
    try {
      storage.set(
        cacheKey(kind, locale),
        JSON.stringify({ts: Date.now(), entries}),
      );
    } catch {}
  }

  return {entries, totalCount: grid?.pageInfo?.totalCount};
};
