import {storage} from '../store/mmkv';
import {getGfnLocaleSlug} from './locale';

// GeForce NOW's supported-games list is served as a public, no-auth JSON, so we
// can show a browsable catalog before any NVIDIA login is wired up. Steam-backed
// titles get cover art from Steam's CDN; other stores (Epic, etc.) have none.
// One such JSON exists per locale (confirmed live -- see gfn/locale.ts), with
// actually-translated titles, not just an English list under a different URL.
const publicGamesUrl = (slug: string): string =>
  `https://static.nvidiagrid.net/supported-public-game-list/locales/gfnpc-${slug}.json`;

// Locale-scoped so switching the app's language (which restarts the app --
// see Settings.tsx) doesn't serve a stale English-cached list under a
// Japanese session, or vice versa.
const cacheKey = (slug: string): string => `gfn.publicGames.${slug}`;
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
  /** True when the signed-in user owns this title (from the authed library). */
  owned?: boolean;
  /**
   * GFN's own app-level uuid (distinct from `id`, which is the per-store
   * numeric CloudMatch launch id) -- only known for titles resolved through
   * an authenticated apps() response (owned library, catalog rank), since
   * the public catalog never carries it. Needed to look up GFN's own rich
   * per-title metadata (AppDataForAppId).
   */
  appId?: string;
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

// Extracts the numeric app id straight after "/app/" in a Steam store URL.
// Deliberately matches only a *leading* digit run rather than requiring the
// whole remainder to be numeric -- confirmed live that GFN's authenticated
// browse query (gfn/catalog.ts's fetchGfnFullCatalog) returns storeUrl with
// no trailing slash before the query string at all, e.g.
// ".../app/1059220?utm_source=nvidia&utm_campaign=geforce_now". The old
// full-match check split on "/" first, so that entire query string (with no
// "/" in it) was compared against ^\d+$ as one piece and never matched --
// silently discarding steamAppId for effectively every browse-query result
// (confirmed live: 576/576 Steam variants across 3 browse pages parse
// correctly with this fix, versus 0/576 with the old one). The public
// JSON's own steamUrl (".../app/12345/Some_Game/") still parses the same as
// before either way, since both forms share a leading digit run.
export const steamAppIdFromUrl = (steamUrl?: string): string | undefined => {
  if (!steamUrl) {
    return undefined;
  }
  const after = steamUrl.split('/app/')[1];
  if (!after) {
    return undefined;
  }
  const match = /^(\d+)/.exec(after);
  return match ? match[1] : undefined;
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

// Not re-sorted here: every caller (Library.tsx, via mergeOwnedGames ->
// buildUnifiedCatalog) already sorts its own final output by title, so
// sorting ~1500+ entries with a locale-aware comparator here would just be
// redundant CPU work discarded by the next sort downstream -- felt mainly
// on weaker hardware (e.g. Google TV boxes) where it's slow enough to
// notice.
const mapPayload = (payload: RawPublicGame[]): GfnGame[] =>
  (Array.isArray(payload) ? payload : [])
    .filter(item => item.status === 'AVAILABLE' && !!item.title)
    .map(toGfnGame);

// Cached list if still fresh, else null.
export const getFreshGfnGames = (): GfnGame[] | null => {
  const raw = storage.getString(cacheKey(getGfnLocaleSlug()));
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
  const raw = storage.getString(cacheKey(getGfnLocaleSlug()));
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
  const slug = getGfnLocaleSlug();
  const res = await fetch(publicGamesUrl(slug));
  if (!res.ok) {
    throw new Error(`GFN public games fetch failed (${res.status})`);
  }
  const payload = (await res.json()) as RawPublicGame[];
  const games = mapPayload(payload);
  try {
    storage.set(cacheKey(slug), JSON.stringify({ts: Date.now(), games}));
  } catch {}
  return games;
};
