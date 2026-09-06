import {storage} from '../store/mmkv';
import {GfnGame} from './publicGames';

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
        gfn { library { status } }
      }
    }
  }
}`;

type RawVariant = {
  id?: string;
  appStore?: string;
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

const toOwnedGame = (app: RawApp): GfnGame | null => {
  const title = app.title?.trim();
  if (!title) {
    return null;
  }
  const variants = app.variants ?? [];
  // The launch app id is a numeric variant id (falls back to a numeric app id).
  const numericVariant = variants.find(v => isNumeric(v.id));
  const launchId =
    numericVariant?.id ?? (isNumeric(app.id) ? app.id : undefined);
  const store = (numericVariant ?? variants[0])?.appStore ?? 'GFN';
  return {
    id: launchId ?? String(app.id ?? title),
    title,
    store,
    genres: [],
    imageUrl: firstImage(app.images, [
      'HERO_IMAGE',
      'TV_BANNER',
      'KEY_ART',
      'GAME_BOX_ART',
    ]),
    owned: true,
  };
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
  const games = items
    .map(toOwnedGame)
    .filter((g): g is GfnGame => g !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
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

const normalizeTitle = (title: string): string =>
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
  const ownedById = new Set(ownedGames.map(g => g.id));
  const ownedByTitle = new Set(ownedGames.map(g => normalizeTitle(g.title)));

  const merged = publicGames.map(g =>
    ownedById.has(g.id) || ownedByTitle.has(normalizeTitle(g.title))
      ? {...g, owned: true}
      : g,
  );

  const presentTitles = new Set(merged.map(g => normalizeTitle(g.title)));
  const extras = ownedGames.filter(
    g => !presentTitles.has(normalizeTitle(g.title)),
  );

  return [...merged, ...extras].sort((a, b) => a.title.localeCompare(b.title));
};
