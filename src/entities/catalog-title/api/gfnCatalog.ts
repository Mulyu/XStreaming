import {storage} from '../../../shared/lib/mmkv';
import {GfnGame, steamAppIdFromUrl} from './gfnPublicGames';
import {getGfnLocaleSlug, getGfnGraphqlLocale} from './gfnLocale';

// GeForce NOW authenticated catalog. The public supported-games list has no
// ownership info and omits account-linked titles (e.g. Battle.net games like
// Overwatch), so the user's owned library comes from the authed GraphQL API.
// That same API also exposes the full browse catalog (fetchGfnFullCatalog
// below) -- much larger than the public JSON's ~1500-title snapshot, closer
// to what NVIDIA's own site lists. Neither this nor the public JSON can see
// Install-to-Play titles (NVIDIA's separate, much larger "install any game
// from your own Steam library" tier) -- there's no known public API for
// that catalog dimension at all.
// Ported/condensed from OpenNOW (MIT).

const GRAPHQL_URL = 'https://games.geforce.com/graphql';
const SERVER_INFO_URL =
  'https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo';
const LCARS_CLIENT_ID = 'ec7e38d4-03af-4b58-b131-cfb0495903ab';
const GFN_CLIENT_VERSION = '2.0.80.173';
const GFN_PLAY_ORIGIN = 'https://play.geforcenow.com';
const GFN_PLAY_REFERER = 'https://play.geforcenow.com/';
const GFN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';

// Locale-scoped for the same reason as publicGames.ts's own cache: a
// title's `title` text is locale-specific, and the app's language only ever
// changes via a full restart, so there's no risk of serving a stale-locale
// list mid-session.
const ownedCacheKey = (): string => `gfn.ownedGames.${getGfnLocaleSlug()}`;
const OWNED_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const deviceHeaders = {
  'nv-device-os': 'WINDOWS',
  'nv-device-type': 'DESKTOP',
  'nv-device-make': 'UNKNOWN',
  'nv-device-model': 'UNKNOWN',
};

const graphqlHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  Origin: GFN_PLAY_ORIGIN,
  Referer: GFN_PLAY_REFERER,
  Authorization: `GFNJWT ${token}`,
  'nv-client-id': LCARS_CLIENT_ID,
  'nv-client-type': 'NATIVE',
  'nv-client-version': GFN_CLIENT_VERSION,
  'nv-client-streamer': 'NVIDIA-CLASSIC',
  'nv-browser-type': 'CHROME',
  'User-Agent': GFN_USER_AGENT,
  ...deviceHeaders,
});

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const SERVER_INFO_TIMEOUT_MS = 15000;
const VPC_ID_RETRIES = 2;
const VPC_ID_RETRY_DELAY_MS = 1000;

// Resolved once per token and reused for the rest of the session -- every
// catalog query below used to call this independently, multiplying the
// number of chances for a single flaky request to silently degrade one of
// them.
let cachedVpcId: {token: string; vpcId: string} | null = null;

const fetchServerInfoOnce = async (token: string): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_INFO_TIMEOUT_MS);
  try {
    const res = await fetch(SERVER_INFO_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `GFNJWT ${token}`,
        'nv-client-id': LCARS_CLIENT_ID,
        'nv-client-type': 'NATIVE',
        'nv-client-version': GFN_CLIENT_VERSION,
        'nv-client-streamer': 'NVIDIA-CLASSIC',
        'User-Agent': GFN_USER_AGENT,
        ...deviceHeaders,
      },
    });
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json()) as any;
    const serverId = payload?.requestStatus?.serverId;
    return typeof serverId === 'string' && serverId ? serverId : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// The GFN "virtual PC id" every catalog query below needs -- confirmed live
// this isn't just a cosmetic client-identity field: querying with the
// account's real, server-resolved vpcId returns the account's actual ~200+
// owned titles and a 6,000+-title browse catalog, while the hardcoded
// 'GFN-PC' placeholder this used to silently fall back to on ANY failure
// (no retry, no timeout) gets back a near-empty demo-sized response instead
// (totalCount 2, 0 owned) -- one that still looks like a completed, successful
// fetch to every caller, not a failure. Retries a couple of times before
// giving up, and returns null (rather than that placeholder) so callers can
// tell "genuinely failed" from "resolved, here's the id" and treat the
// former as the failure it is instead of quietly fetching a hollow catalog.
const getVpcId = async (token: string): Promise<string | null> => {
  if (cachedVpcId?.token === token) {
    return cachedVpcId.vpcId;
  }
  for (let attempt = 0; attempt <= VPC_ID_RETRIES; attempt++) {
    const serverId = await fetchServerInfoOnce(token);
    if (serverId) {
      cachedVpcId = {token, vpcId: serverId};
      return serverId;
    }
    if (attempt < VPC_ID_RETRIES) {
      await delay(VPC_ID_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return null;
};

// Owned-library filter + sort matching the official client.
const LIBRARY_FILTER = {
  variants: {gfn: {library: {status: {notEquals: 'NOT_OWNED'}}}},
};
const LIBRARY_SORT =
  'variants.gfn.library.lastPlayedDate:DESC,computedValues.libraryAddedDate:DESC,sortName:ASC';

const LIBRARY_QUERY = `query GetLibraryApps(
  $vpcId: String!,
  $locale: String!,
  $sortString: String!,
  $fetchCount: Int!,
  $cursor: String!,
  $filters: AppFilterFields!
) {
  apps(
    vpcId: $vpcId,
    language: $locale,
    orderBy: $sortString,
    first: $fetchCount,
    after: $cursor,
    filters: $filters
  ) {
    items {
      id
      title
      images { HERO_IMAGE TV_BANNER KEY_ART GAME_BOX_ART }
      variants {
        id
        appStore
        storeUrl
        gfn { library { status } }
      }
    }
  }
}`;

type RawVariant = {
  id?: string;
  appStore?: string;
  storeUrl?: string;
  gfn?: {library?: {status?: string}};
};

type RawApp = {
  id?: string;
  title?: string;
  images?: Record<string, string | string[] | undefined>;
  variants?: RawVariant[];
};

const optimizeImage = (url: string, width = 460): string =>
  url.includes('img.nvidiagrid.net') ? `${url};f=webp;w=${width}` : url;

const firstImage = (
  images: RawApp['images'],
  keys: string[],
): string | undefined => {
  if (!images) {
    return undefined;
  }
  for (const key of keys) {
    const raw = images[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && value.trim()) {
      return optimizeImage(value.trim());
    }
  }
  return undefined;
};

const isNumeric = (v?: string): boolean => !!v && /^\d+$/.test(v);

// One owned app can be linked to more than one store (Steam + Epic + Xbox,
// say) -- each is its own launchable CloudMatch id. Emit one GfnGame per
// distinct numeric store variant instead of collapsing to a single guess, so
// the caller (the unified Library's provider/store picker) can offer all of
// them instead of silently picking one.
const toOwnedGames = (app: RawApp): GfnGame[] => {
  const title = app.title?.trim();
  if (!title) {
    return [];
  }
  const variants = app.variants ?? [];
  const numericVariants = variants.filter(v => isNumeric(v.id));
  const usable = numericVariants.length > 0 ? numericVariants : variants;
  const image = firstImage(app.images, [
    'HERO_IMAGE',
    'TV_BANNER',
    'KEY_ART',
    'GAME_BOX_ART',
  ]);

  // The app-level uuid (distinct from each variant's numeric launch id) --
  // only ever available from an authenticated apps() response like this one.
  // Needed to look up GFN's own rich per-title metadata (AppDataForAppId).
  const appId = app.id && !isNumeric(app.id) ? app.id : undefined;

  if (usable.length === 0) {
    return [
      {
        id: isNumeric(app.id) ? app.id! : String(app.id ?? title),
        title,
        store: 'GFN',
        genres: [],
        imageUrl: image,
        owned: true,
        appId,
      },
    ];
  }

  const seen = new Set<string>();
  return usable.reduce<GfnGame[]>((acc, variant) => {
    const id = variant.id ?? String(app.id ?? title);
    const store = variant.appStore ?? 'GFN';
    const key = `${store}:${id}`;
    if (seen.has(key)) {
      return acc;
    }
    seen.add(key);
    acc.push({
      id,
      title,
      store,
      genres: [],
      imageUrl: image,
      owned: true,
      appId,
      steamAppId:
        store.toUpperCase() === 'STEAM'
          ? steamAppIdFromUrl(variant.storeUrl)
          : undefined,
    });
    return acc;
  }, []);
};

// Fetch the signed-in user's owned GFN games (one page, up to 200 — covers
// virtually every library). Returns [] on any failure.
export const fetchGfnOwnedGames = async (token: string): Promise<GfnGame[]> => {
  const vpcId = await getVpcId(token);
  if (!vpcId) {
    return [];
  }
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        query: LIBRARY_QUERY,
        variables: {
          vpcId,
          locale: getGfnGraphqlLocale(),
          sortString: LIBRARY_SORT,
          fetchCount: 200,
          cursor: '',
          filters: LIBRARY_FILTER,
        },
      }),
    });
  } catch {
    return [];
  }
  if (!res.ok) {
    return [];
  }
  let payload: any;
  try {
    payload = await res.json();
  } catch {
    return [];
  }
  const items: RawApp[] = payload?.data?.apps?.items ?? [];
  // Deliberately NOT re-sorted alphabetically: the server already returns
  // these in LIBRARY_SORT order (most-recently-played first), which the
  // Library screen's "Recently played" sort reuses as-is. Callers that want
  // alphabetical order (mergeOwnedGames) already re-sort their own output.
  const games = items.flatMap(toOwnedGames);
  try {
    storage.set(ownedCacheKey(), JSON.stringify({ts: Date.now(), games}));
  } catch {}
  return games;
};

export const getFreshOwnedGames = (): GfnGame[] | null => {
  const raw = storage.getString(ownedCacheKey());
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.games) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < OWNED_CACHE_TTL_MS
    ) {
      return parsed.games as GfnGame[];
    }
  } catch {}
  return null;
};

export const clearOwnedGames = (): void => {
  try {
    storage.delete(ownedCacheKey());
  } catch {}
};

// Same variant-flattening as toOwnedGames, but for the unfiltered full-catalog
// browse query below -- most items here are NOT owned, so ownership is read
// per variant from gfn.library.status (present whenever the caller is signed
// in) instead of being hardcoded true.
const toBrowseGames = (app: RawApp): GfnGame[] => {
  const title = app.title?.trim();
  if (!title) {
    return [];
  }
  const variants = app.variants ?? [];
  const numericVariants = variants.filter(v => isNumeric(v.id));
  const usable = numericVariants.length > 0 ? numericVariants : variants;
  const image = firstImage(app.images, [
    'HERO_IMAGE',
    'TV_BANNER',
    'KEY_ART',
    'GAME_BOX_ART',
  ]);
  const appId = app.id && !isNumeric(app.id) ? app.id : undefined;

  if (usable.length === 0) {
    return [
      {
        id: isNumeric(app.id) ? app.id! : String(app.id ?? title),
        title,
        store: 'GFN',
        genres: [],
        imageUrl: image,
        appId,
      },
    ];
  }

  const seen = new Set<string>();
  return usable.reduce<GfnGame[]>((acc, variant) => {
    const id = variant.id ?? String(app.id ?? title);
    const store = variant.appStore ?? 'GFN';
    const key = `${store}:${id}`;
    if (seen.has(key)) {
      return acc;
    }
    seen.add(key);
    acc.push({
      id,
      title,
      store,
      genres: [],
      imageUrl: image,
      owned: variant.gfn?.library?.status
        ? variant.gfn.library.status !== 'NOT_OWNED'
        : undefined,
      appId,
      steamAppId:
        store.toUpperCase() === 'STEAM'
          ? steamAppIdFromUrl(variant.storeUrl)
          : undefined,
    });
    return acc;
  }, []);
};

const BROWSE_QUERY = `query GetStoreBrowseApps(
  $vpcId: String!,
  $locale: String!,
  $sortString: String!,
  $fetchCount: Int!,
  $cursor: String!,
  $filters: AppFilterFields!
) {
  apps(
    vpcId: $vpcId,
    language: $locale,
    orderBy: $sortString,
    first: $fetchCount,
    after: $cursor,
    filters: $filters
  ) {
    pageInfo { hasNextPage endCursor totalCount }
    items {
      id
      title
      images { HERO_IMAGE TV_BANNER KEY_ART GAME_BOX_ART }
      variants {
        id
        appStore
        storeUrl
        gfn { library { status } }
      }
    }
  }
}`;

const fullCatalogCacheKey = (): string =>
  `gfn.fullCatalog.${getGfnLocaleSlug()}`;
const fullCatalogStatusKey = (): string =>
  `gfn.fullCatalog.status.${getGfnLocaleSlug()}`;
// 24h -- unlike the other caches above, a full paginated fetch here is dozens
// of sequential requests, not one, so it's worth holding onto longer.
const FULL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const BROWSE_PAGE_SIZE = 200;
// NVIDIA's own site advertises 4000+ games (2200+ of them Install-to-Play,
// which this query can't see -- see the module comment). Cap comfortably
// above that so a pagination bug (a cursor the server never advances) can't
// loop forever.
const BROWSE_MAX_PAGES = 40;
// Extra attempts for a single page before giving up on the whole crawl -- a
// transient failure on any one of up to 40 sequential requests used to end
// the crawl right there (see GfnFullCatalogResult's `complete` below for why
// that matters now that nothing else backstops this catalog).
const BROWSE_PAGE_RETRIES = 2;
const BROWSE_PAGE_RETRY_DELAY_MS = 1000;

const fetchBrowsePage = async (
  token: string,
  vpcId: string,
  cursor: string,
): Promise<any> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BROWSE_PAGE_RETRIES; attempt++) {
    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: graphqlHeaders(token),
        body: JSON.stringify({
          query: BROWSE_QUERY,
          variables: {
            vpcId,
            locale: getGfnGraphqlLocale(),
            sortString: 'sortName:ASC',
            fetchCount: BROWSE_PAGE_SIZE,
            cursor,
            filters: {},
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`GFN browse page failed (${res.status})`);
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt < BROWSE_PAGE_RETRIES) {
        await delay(BROWSE_PAGE_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError;
};

export type GfnFullCatalogResult = {
  games: GfnGame[];
  // False whenever the crawl gave up before genuinely exhausting the
  // catalog (a page failed even after retries, or the server handed back a
  // cursor that didn't advance) -- as opposed to a real end-of-catalog
  // signal (hasNextPage: false, or an empty page). See getGfnFullCatalogStatus
  // for how this is surfaced to the user.
  complete: boolean;
  totalCount?: number;
};

export type GfnFullCatalogStatus = {
  ts: number;
  complete: boolean;
  count: number;
  totalCount?: number;
};

const setFullCatalogStatus = (status: GfnFullCatalogStatus): void => {
  try {
    storage.set(fullCatalogStatusKey(), JSON.stringify(status));
  } catch {}
};

// Last known outcome of fetchGfnFullCatalog, independent of whether it ran
// in this session -- lets the Settings screen show "loaded / partial /
// failed" without needing to trigger a fetch itself.
export const getGfnFullCatalogStatus = (): GfnFullCatalogStatus | null => {
  const raw = storage.getString(fullCatalogStatusKey());
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.ts === 'number' ? parsed : null;
  } catch {
    return null;
  }
};

// Discards both the cached catalog and its status, so the next load starts
// from a genuinely clean slate instead of one a stale partial result could
// still be backstopping. Used by Settings' manual "clear + reload".
export const clearGfnFullCatalog = (): void => {
  try {
    storage.delete(fullCatalogCacheKey());
    storage.delete(fullCatalogStatusKey());
  } catch {}
};

// The full GFN browse catalog -- every title NVIDIA has cataloged, not just
// what's in the signed-in user's library (fetchGfnOwnedGames). This is now
// the ONLY source the app reads GFN's catalog membership from (the small,
// stale public JSON snapshot in publicGames.ts is no longer consulted here --
// live-verified it omits entire franchises, e.g. every Monster Hunter and
// Battle.net-linked title). Same `apps()` query and AppFilterFields schema as
// the owned-library/rank queries above, just with no ownership filter and
// paginated to the end via cursor/hasNextPage. Ported from OpenNOW's
// GetStoreBrowseApps (MIT) -- the same query that backs NVIDIA's own official
// "Games" browse page. Requires a signed-in token.
//
// Returns whatever was fetched before the crawl stopped (possibly partial,
// possibly empty) rather than throwing, and reports whether it actually
// reached the end via `complete` -- each page gets a few retries first (see
// fetchBrowsePage), but a persistent failure still truncates the crawl at
// that point rather than blocking forever. Callers should still use a
// partial result (better than nothing, now that there's no public-list
// fallback) but may want to prompt a retry when `complete` is false.
export const fetchGfnFullCatalog = async (
  token: string,
): Promise<GfnFullCatalogResult> => {
  const vpcId = await getVpcId(token);
  if (!vpcId) {
    setFullCatalogStatus({ts: Date.now(), complete: false, count: 0});
    return {games: [], complete: false};
  }
  const games: GfnGame[] = [];
  let cursor = '';
  let complete = false;
  let totalCount: number | undefined;
  for (let page = 0; page < BROWSE_MAX_PAGES; page++) {
    let payload: any;
    try {
      payload = await fetchBrowsePage(token, vpcId, cursor);
    } catch {
      break; // Gave up on this page even after retries -- not complete.
    }
    const apps = payload?.data?.apps;
    const items: RawApp[] = apps?.items ?? [];
    const pageInfo = apps?.pageInfo;
    if (typeof pageInfo?.totalCount === 'number') {
      totalCount = pageInfo.totalCount;
    }
    if (items.length === 0) {
      complete = true;
      break;
    }
    games.push(...items.flatMap(toBrowseGames));
    if (pageInfo?.hasNextPage !== true) {
      complete = true;
      break;
    }
    const next = pageInfo?.endCursor;
    if (!next || next === cursor) {
      // The cursor didn't advance -- a server anomaly, not genuine
      // exhaustion, so this is NOT a complete crawl.
      break;
    }
    cursor = next;
  }
  setFullCatalogStatus({
    ts: Date.now(),
    complete,
    count: games.length,
    totalCount,
  });
  if (games.length > 0) {
    try {
      storage.set(
        fullCatalogCacheKey(),
        JSON.stringify({ts: Date.now(), games}),
      );
    } catch {}
  }
  return {games, complete, totalCount};
};

export const getFreshFullCatalog = (): GfnGame[] | null => {
  const raw = storage.getString(fullCatalogCacheKey());
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.games) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < FULL_CATALOG_TTL_MS
    ) {
      return parsed.games as GfnGame[];
    }
  } catch {}
  return null;
};

export const getCachedFullCatalog = (): GfnGame[] | null => {
  const raw = storage.getString(fullCatalogCacheKey());
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.games) ? (parsed.games as GfnGame[]) : null;
  } catch {
    return null;
  }
};

// Server-side sort strings confirmed live against GFN's own
// FilterGroupAndSortOrderDefinitions catalog query -- the same "Most
// Popular"/"Newest" options GFN's own web client offers.
export const GFN_SORT_MOST_POPULAR =
  'itemMetadata.gfnPopularityRank:ASC,sortName:ASC';
export const GFN_SORT_LAST_ADDED =
  'computedValues.libraryAddedDate:DESC,sortName:ASC';

const CATALOG_RANK_QUERY = `query GetCatalogRank(
  $vpcId: String!,
  $locale: String!,
  $sortString: String!,
  $fetchCount: Int!,
  $cursor: String!,
  $filters: AppFilterFields!
) {
  apps(
    vpcId: $vpcId,
    language: $locale,
    orderBy: $sortString,
    first: $fetchCount,
    after: $cursor,
    filters: $filters
  ) {
    pageInfo { hasNextPage endCursor }
    items { id variants { id } }
  }
}`;

// Ranks the whole GFN catalog (not just the signed-in user's library) by a
// server-side sort, mirroring xCloud's popularOrder.ts: an ORDERED id list
// (not raw scores), built from every numeric store-variant id so it can be
// looked up the same way GfnGame.id already is everywhere else. Requires a
// signed-in token, same as the owned-library query -- GFN's catalog-browse
// endpoint doesn't serve this to anonymous callers.
//
// Paginated to the end (like fetchGfnFullCatalog) rather than a single fixed
// page -- with the catalog now in the thousands (see fetchGfnFullCatalog), a
// single 200-title page only ranked a sliver of it and left everything past
// that page tied at "unranked", which the caller's tie-break sorts
// alphabetically. That looked like the whole "Popular"/"Newest" sort had
// silently become alphabetical once the catalog grew past a couple hundred
// titles. Returns whatever was fetched before the first error.
export const fetchGfnCatalogOrder = async (
  token: string,
  orderBy: string,
): Promise<string[]> => {
  const vpcId = await getVpcId(token);
  if (!vpcId) {
    return [];
  }
  const order: string[] = [];
  const seen = new Set<string>();
  let cursor = '';
  for (let page = 0; page < BROWSE_MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: graphqlHeaders(token),
        body: JSON.stringify({
          query: CATALOG_RANK_QUERY,
          variables: {
            vpcId,
            locale: getGfnGraphqlLocale(),
            sortString: orderBy,
            fetchCount: BROWSE_PAGE_SIZE,
            cursor,
            // No filter -- rank the whole catalog, matching how OpenNOW's own
            // browse-with-no-filters call passes an empty object rather than
            // omitting the (non-null) filters argument.
            filters: {},
          },
        }),
      });
    } catch {
      break;
    }
    if (!res.ok) {
      break;
    }
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      break;
    }
    const apps = payload?.data?.apps;
    const items: RawApp[] = apps?.items ?? [];
    if (items.length === 0) {
      break;
    }
    items.forEach(app => {
      const variants = (app.variants ?? []).filter(v => isNumeric(v.id));
      const ids =
        variants.length > 0
          ? variants.map(v => v.id!)
          : isNumeric(app.id)
          ? [app.id!]
          : [];
      ids.forEach(id => {
        if (!seen.has(id)) {
          seen.add(id);
          order.push(id);
        }
      });
    });
    const pageInfo = apps?.pageInfo;
    const next = pageInfo?.endCursor;
    if (pageInfo?.hasNextPage !== true || !next || next === cursor) {
      break;
    }
    cursor = next;
  }
  return order;
};

export type GfnAppDetails = {
  developerName?: string;
  publisherName?: string;
  shortDescription?: string;
  longDescription?: string;
  genres?: string[];
  screenshots: string[];
};

// Trimmed to only the fields this app actually renders -- the real
// AppDataForAppId query (captured from OpenNOW) also carries content
// ratings, per-store SKU/tier-gating strings and nvidia-tech flags this app
// has no UI for yet.
const APP_DETAILS_QUERY = `query GetAppDataQueryForAppId(
  $vpcId: String!,
  $locale: String!,
  $appIds: [String]!
) {
  apps(vpcId: $vpcId, language: $locale, appIds: $appIds) {
    items {
      developerName
      publisherName
      shortDescription
      longDescription
      genres
      images { SCREENSHOTS }
    }
  }
}`;

// GFN's own rich per-title metadata -- description, screenshots, developer/
// publisher -- used only as a fallback/supplement to xCloud's richer
// DisplayCatalog data (see utils/storePrice.ts), for a GFN-only title or to
// pad out a thin media strip. Needs the title's app-level uuid (GfnGame's
// `appId`, only known for titles resolved through an authenticated apps()
// response) and a signed-in token -- unlike the catalog-browse query above,
// this one returned nothing at all for an anonymous call even against a
// title from the small anonymous-visible set, confirmed live. Returns null
// on any failure or when the app isn't found.
export const fetchGfnAppDetails = async (
  token: string,
  appId: string,
): Promise<GfnAppDetails | null> => {
  const vpcId = await getVpcId(token);
  if (!vpcId) {
    return null;
  }
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        query: APP_DETAILS_QUERY,
        variables: {vpcId, locale: getGfnGraphqlLocale(), appIds: [appId]},
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  let payload: any;
  try {
    payload = await res.json();
  } catch {
    return null;
  }
  const item = payload?.data?.apps?.items?.[0];
  if (!item) {
    return null;
  }
  const screenshots = item.images?.SCREENSHOTS;
  return {
    developerName: item.developerName || undefined,
    publisherName: item.publisherName || undefined,
    shortDescription: item.shortDescription || undefined,
    longDescription: item.longDescription || undefined,
    genres: Array.isArray(item.genres) ? item.genres : undefined,
    screenshots: Array.isArray(screenshots) ? screenshots.filter(Boolean) : [],
  };
};

// The catalog-wide identity key: groups xCloud/GFN entries for the same
// title (buildUnifiedCatalog), matches owned games back onto the base
// catalog (mergeOwnedGames), and keys favorites/provider-preference storage
// and the Library grid's own FlatList. Strips case, punctuation and
// trademark symbols so e.g. "Marvel's Spider-Man: Remastered" and "MARVEL'S
// SPIDER MAN REMASTERED" collapse to the same key.
//
// \p{L}/\p{N} (Unicode letter/number categories, not the ASCII-only a-z0-9
// this used to check) is required, not cosmetic: a title in Japanese --
// GFN's ja_JP-locale catalog serves these, e.g. "モンスターハンターワイルズ"
// -- has NO a-z0-9 characters in it at all, so the old ASCII-only pattern
// replaced the *entire* title with spaces and normalized it to "". Every
// Japanese-only-titled game collapsed onto that same "" key, silently
// merging them into whichever one was processed last and losing the rest
// from the catalog, favorites, and provider preferences alike -- confirmed
// live against a real ja_JP account's owned library (Overwatch, Monster
// Hunter Wilds, and most of the rest of a ~200-title library all produced
// the P{L}-empty "" key). \p{L}/\p{N} keeps any script's own letters/digits
// as themselves instead of discarding them, so distinct titles in Japanese
// (or Chinese, Korean, Cyrillic, ...) stay distinct.
export const normalizeTitle = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Merge owned games into the public catalog: mark matching public titles as
// owned, and append owned titles the public list doesn't carry (e.g.
// Overwatch). Output order is whatever `publicGames` + the appended extras
// happen to be in -- not re-sorted, since every real caller
// (unifiedCatalog.ts's buildUnifiedCatalog) already sorts its own final
// output by title, and a locale-aware sort over ~1500+ entries is real,
// noticeable CPU work to spend on an order the next sort would discard
// anyway (most apparent on weaker hardware, e.g. Google TV boxes).
export const mergeOwnedGames = (
  publicGames: GfnGame[],
  ownedGames: GfnGame[],
): GfnGame[] => {
  if (ownedGames.length === 0) {
    return publicGames;
  }
  const ownedById = new Map(ownedGames.map(g => [g.id, g]));
  const ownedByTitle = new Map(
    ownedGames.map(g => [normalizeTitle(g.title), g]),
  );

  const merged = publicGames.map(g => {
    const owned =
      ownedById.get(g.id) ?? ownedByTitle.get(normalizeTitle(g.title));
    if (!owned) {
      return g;
    }
    // Carry over what only the authenticated fetch knows -- the public
    // catalog entry has neither the app-level uuid nor (usually) a Steam
    // appid the public JSON's own steamUrl parsing already found anyway.
    return {
      ...g,
      owned: true,
      appId: g.appId ?? owned.appId,
      steamAppId: g.steamAppId ?? owned.steamAppId,
    };
  });

  const presentTitles = new Set(merged.map(g => normalizeTitle(g.title)));
  const extras = ownedGames.filter(
    g => !presentTitles.has(normalizeTitle(g.title)),
  );

  return [...merged, ...extras];
};
