import {storage} from '../store/mmkv';
import {GfnGame, steamAppIdFromUrl} from './publicGames';

// GeForce NOW authenticated catalog. The public supported-games list has no
// ownership info and omits account-linked titles (e.g. Battle.net games like
// Overwatch), so the user's owned library comes from the authed GraphQL API.
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

const OWNED_CACHE_KEY = 'gfn.ownedGames';
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

// The GFN "virtual PC id"; identifies the client build to the catalog. Best
// effort — falls back to the constant NVIDIA's clients use.
const getVpcId = async (token: string): Promise<string> => {
  try {
    const res = await fetch(SERVER_INFO_URL, {
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
      return 'GFN-PC';
    }
    const payload = (await res.json()) as any;
    return payload?.requestStatus?.serverId ?? 'GFN-PC';
  } catch {
    return 'GFN-PC';
  }
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
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        query: LIBRARY_QUERY,
        variables: {
          vpcId,
          locale: 'en_US',
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
    storage.set(OWNED_CACHE_KEY, JSON.stringify({ts: Date.now(), games}));
  } catch {}
  return games;
};

export const getFreshOwnedGames = (): GfnGame[] | null => {
  const raw = storage.getString(OWNED_CACHE_KEY);
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
    storage.delete(OWNED_CACHE_KEY);
  } catch {}
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
  $filters: AppFilterFields!
) {
  apps(
    vpcId: $vpcId,
    language: $locale,
    orderBy: $sortString,
    first: $fetchCount,
    after: "",
    filters: $filters
  ) {
    items { id variants { id } }
  }
}`;

// Ranks the whole GFN catalog (not just the signed-in user's library) by a
// server-side sort, mirroring xCloud's popularOrder.ts: an ORDERED id list
// (not raw scores), built from every numeric store-variant id so it can be
// looked up the same way GfnGame.id already is everywhere else. Requires a
// signed-in token, same as the owned-library query -- GFN's catalog-browse
// endpoint doesn't serve this to anonymous callers. Returns [] on failure.
export const fetchGfnCatalogOrder = async (
  token: string,
  orderBy: string,
  fetchCount = 200,
): Promise<string[]> => {
  const vpcId = await getVpcId(token);
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        query: CATALOG_RANK_QUERY,
        variables: {
          vpcId,
          locale: 'en_US',
          sortString: orderBy,
          fetchCount,
          // No filter -- rank the whole catalog, matching how OpenNOW's own
          // browse-with-no-filters call passes an empty object rather than
          // omitting the (non-null) filters argument.
          filters: {},
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
  const order: string[] = [];
  const seen = new Set<string>();
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
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        query: APP_DETAILS_QUERY,
        variables: {vpcId, locale: 'en_US', appIds: [appId]},
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

export const normalizeTitle = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Merge owned games into the public catalog: mark matching public titles as
// owned, and append owned titles the public list doesn't carry (e.g. Overwatch).
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

  return [...merged, ...extras].sort((a, b) => a.title.localeCompare(b.title));
};
