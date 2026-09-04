import {storage} from '../store/mmkv';

// GeForce NOW's supported-games list is served as a public, no-auth JSON, so we
// can show a browsable catalog before any NVIDIA login is wired up. Steam-backed
// titles get cover art from Steam's CDN; other stores (Epic, etc.) have none.
const PUBLIC_GAMES_URL =
  'https://static.nvidiagrid.net/supported-public-game-list/locales/gfnpc-en-US.json';

const CACHE_KEY = 'gfn.publicGames';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export type GfnGame = {
  id: string;
  title: string;
  store: string;
  publisher?: string;
  genres: string[];
  steamAppId?: string;
  imageUrl?: string;
  heroUrl?: string;
};

type RawPublicGame = {
  id?: string | number;
  title?: string;
  steamUrl?: string;
  store?: string;
  publisher?: string;
  genres?: string[];
  status?: string;
};

const steamAppIdFromUrl = (steamUrl?: string): string | undefined => {
  if (!steamUrl) {
    return undefined;
  }
  const after = steamUrl.split('/app/')[1];
  const id = after ? after.split('/')[0] : '';
  return /^\d+$/.test(id) ? id : undefined;
};

const toGfnGame = (item: RawPublicGame): GfnGame => {
  const steamAppId = steamAppIdFromUrl(item.steamUrl);
  return {
    id: String(item.id ?? item.title ?? 'unknown'),
    title: item.title ?? '',
    store: item.store ?? 'Unknown',
    publisher: item.publisher,
    genres: Array.isArray(item.genres) ? item.genres : [],
    steamAppId,
    imageUrl: steamAppId
      ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`
      : undefined,
    heroUrl: steamAppId
      ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_hero.jpg`
      : undefined,
  };
};

const mapPayload = (payload: RawPublicGame[]): GfnGame[] =>
  (Array.isArray(payload) ? payload : [])
    .filter(item => item.status === 'AVAILABLE' && !!item.title)
    .map(toGfnGame)
    .sort((a, b) => a.title.localeCompare(b.title));

// Cached list if still fresh, else null.
export const getFreshGfnGames = (): GfnGame[] | null => {
  const raw = storage.getString(CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.games) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < CACHE_TTL_MS
    ) {
      return parsed.games as GfnGame[];
    }
  } catch {}
  return null;
};

// Any cached list regardless of age (for an instant paint while refreshing).
export const getCachedGfnGames = (): GfnGame[] | null => {
  const raw = storage.getString(CACHE_KEY);
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

export const fetchGfnGames = async (): Promise<GfnGame[]> => {
  const res = await fetch(PUBLIC_GAMES_URL);
  if (!res.ok) {
    throw new Error(`GFN public games fetch failed (${res.status})`);
  }
  const payload = (await res.json()) as RawPublicGame[];
  const games = mapPayload(payload);
  try {
    storage.set(CACHE_KEY, JSON.stringify({ts: Date.now(), games}));
  } catch {}
  return games;
};
