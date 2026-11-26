import {NativeModules} from 'react-native';
import {storage} from '../../../shared/lib/mmkv';
import {getGfnLocaleSlug} from './gfnLocale';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('gfnPublicGames');

const {CatalogGfnPublicGamesModule} = NativeModules;

// GeForce NOW's supported-games list is served as a public, no-auth JSON, so we
// can show a browsable catalog before any NVIDIA login is wired up. Steam-backed
// titles get cover art from Steam's CDN; other stores (Epic, etc.) have none.
// One such JSON exists per locale (confirmed live -- see entities/catalog-title/api/gfnLocale.ts), with
// actually-translated titles, not just an English list under a different URL.
// The fetch+parse+row-mapping itself now runs natively -- see
// android/.../java/com/xstreaming/catalog/GfnPublicGamesClient.kt.

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
   * Set when the library lists this store variant only because of a
   * subscription (GFN's library.subscription, e.g. 'XBOX_GAME_PASS' for the
   * Xbox / Ubisoft / Battle.net listings that Game Pass provides), not
   * because it was bought. It counts as owned only while that subscription
   * runs.
   */
  subscription?: string;
  /**
   * GFN's own app-level uuid (distinct from `id`, which is the per-store
   * numeric CloudMatch launch id) -- only known for titles resolved through
   * an authenticated apps() response (owned library, catalog rank), since
   * the public catalog never carries it. Needed to look up GFN's own rich
   * per-title metadata (AppDataForAppId).
   */
  appId?: string;
};

// Extracts the numeric app id straight after "/app/" in a Steam store URL.
// Deliberately matches only a *leading* digit run rather than requiring the
// whole remainder to be numeric -- confirmed live that GFN's authenticated
// browse query (entities/catalog-title/api/gfnCatalog.ts's fetchGfnFullCatalog) returns storeUrl with
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
  let games: GfnGame[] = [];
  try {
    games = ((await CatalogGfnPublicGamesModule?.fetchGames(slug)) ??
      []) as GfnGame[];
  } catch (e) {
    log.info('fetchGfnGames failed:', e);
    return [];
  }
  try {
    storage.set(cacheKey(slug), JSON.stringify({ts: Date.now(), games}));
  } catch {}
  return games;
};
