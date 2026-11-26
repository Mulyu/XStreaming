import {NativeModules} from 'react-native';
import {storage} from '../../../shared/lib/mmkv';
import {GfnGame} from './gfnPublicGames';
import {getGfnLocaleSlug, getGfnGraphqlLocale} from './gfnLocale';

const {CatalogGfnModule} = NativeModules;

// GeForce NOW authenticated catalog. The public supported-games list has no
// ownership info and omits account-linked titles (e.g. Battle.net games like
// Overwatch), so the user's owned library comes from the authed GraphQL API.
// That same API also exposes the full browse catalog (fetchGfnFullCatalog
// below) -- much larger than the public JSON's ~1500-title snapshot, closer
// to what NVIDIA's own site lists. Neither this nor the public JSON can see
// Install-to-Play titles (NVIDIA's separate, much larger "install any game
// from your own Steam library" tier) -- there's no known public API for
// that catalog dimension at all.
//
// The actual GraphQL fetching (vpcId resolution/caching/retry, pagination,
// and the owned/browse row-mapping that used to be toOwnedGames/
// toBrowseGames/isConfirmedPlayable here) now runs natively -- see
// android/.../java/com/xstreaming/catalog/GfnCatalogClient.kt. What stays
// here: normalizeTitle (a pure, widely-used synchronous helper called from
// many unrelated, non-network call sites throughout the app) and
// mergeOwnedGames (a pure synchronous combinator over two already-resolved
// GfnGame[] arrays from two different native modules) never touch the
// network themselves, so there's nothing for native to win there; and the
// MMKV caching, per the same MMKV-sharing-risk reasoning as every earlier
// catalog-title phase.
// Originally ported/condensed from OpenNOW (MIT); that lineage now lives in
// GfnCatalogClient.kt's own history.

// Locale-scoped for the same reason as publicGames.ts's own cache: a
// title's `title` text is locale-specific, and the app's language only ever
// changes via a full restart, so there's no risk of serving a stale-locale
// list mid-session.
// v2: the list holds only the store variants the account actually owns (before,
// every store variant of an owned app). v3: each variant carries its
// `subscription`. Older entries are not reused.
const ownedCacheKey = (): string => `gfn.ownedGames.v3.${getGfnLocaleSlug()}`;
const OWNED_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Fetch the signed-in user's owned GFN games (page by page natively; see
// GfnCatalogClient.getOwnedGames). Returns [] on a failure of the first
// page; if a later page fails the games read so far are returned but not
// cached (native reports this via `complete: false`), so the next load
// tries again.
export const fetchGfnOwnedGames = async (token: string): Promise<GfnGame[]> => {
  let result: {games?: unknown[]; complete?: boolean} | null = null;
  try {
    result = await CatalogGfnModule?.getOwnedGames(
      token,
      getGfnGraphqlLocale(),
    );
  } catch {
    result = null;
  }
  const games = (result?.games ?? []) as GfnGame[];
  if (result?.complete) {
    try {
      storage.set(ownedCacheKey(), JSON.stringify({ts: Date.now(), games}));
    } catch {}
  }
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

// Bumped once (v1 -> v2) because this cache stores each item's `owned` flag
// already baked in at fetch time, not recomputed on read -- live-confirmed
// the OWNED_LIBRARY_STATUSES allowlist fix (denylist -> allowlist) left
// every device's existing 24h-cached catalog exactly as wrong as before,
// since mergeOwnedGames() only ever *adds* ownership for a fresh match and
// passes an already-true `owned` through unchanged otherwise (see its own
// comment) -- there was no path back to false without a fresh fetch.
// Changing the key forces exactly one such fetch per affected device.
const FULL_CATALOG_CACHE_VERSION = 3;
const fullCatalogCacheKey = (): string =>
  `gfn.fullCatalog.v${FULL_CATALOG_CACHE_VERSION}.${getGfnLocaleSlug()}`;
const fullCatalogStatusKey = (): string =>
  `gfn.fullCatalog.status.v${FULL_CATALOG_CACHE_VERSION}.${getGfnLocaleSlug()}`;
// 24h -- unlike the other caches above, a full paginated fetch here is dozens
// of sequential requests, not one, so it's worth holding onto longer.
const FULL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

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
// what's in the signed-in user's library (fetchGfnOwnedGames). This is the
// ONLY source the app reads GFN's catalog membership from (the small, stale
// public JSON snapshot in publicGames.ts is no longer consulted here --
// live-verified it omits entire franchises, e.g. every Monster Hunter and
// Battle.net-linked title). Requires a signed-in token.
//
// Returns whatever was fetched before the crawl stopped (possibly partial,
// possibly empty) rather than throwing, and reports whether it actually
// reached the end via `complete`. Unlike fetchGfnOwnedGames, this still
// caches a non-empty partial result (only the status cache distinguishes
// complete from partial) -- matching the original behavior, since a partial
// browse catalog is still far better than none now that there's no public-
// list fallback.
export const fetchGfnFullCatalog = async (
  token: string,
): Promise<GfnFullCatalogResult> => {
  let result: {
    games?: unknown[];
    complete?: boolean;
    totalCount?: number;
  } | null = null;
  try {
    result = await CatalogGfnModule?.getFullCatalog(
      token,
      getGfnGraphqlLocale(),
    );
  } catch {
    result = null;
  }
  const games = (result?.games ?? []) as GfnGame[];
  const complete = !!result?.complete;
  const totalCount =
    typeof result?.totalCount === 'number' ? result.totalCount : undefined;
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

// Ranks the whole GFN catalog (not just the signed-in user's library) by a
// server-side sort, mirroring xCloud's popularOrder.ts: an ORDERED id list
// (not raw scores). Requires a signed-in token. Returns whatever was
// fetched before the first error.
export const fetchGfnCatalogOrder = async (
  token: string,
  orderBy: string,
): Promise<string[]> => {
  try {
    return ((await CatalogGfnModule?.getCatalogOrder(
      token,
      getGfnGraphqlLocale(),
      orderBy,
    )) ?? []) as string[];
  } catch {
    return [];
  }
};

export type GfnAppDetails = {
  developerName?: string;
  publisherName?: string;
  shortDescription?: string;
  longDescription?: string;
  genres?: string[];
  screenshots: string[];
};

// GFN's own rich per-title metadata -- description, screenshots, developer/
// publisher -- used only as a fallback/supplement to xCloud's richer
// DisplayCatalog data (see entities/catalog-title/api/storePrice.ts), for a
// GFN-only title or to pad out a thin media strip. Needs the title's
// app-level uuid (GfnGame's `appId`, only known for titles resolved through
// an authenticated apps() response) and a signed-in token. Returns null on
// any failure or when the app isn't found.
export const fetchGfnAppDetails = async (
  token: string,
  appId: string,
): Promise<GfnAppDetails | null> => {
  try {
    return ((await CatalogGfnModule?.getAppDetails(
      token,
      getGfnGraphqlLocale(),
      appId,
    )) ?? null) as GfnAppDetails | null;
  } catch {
    return null;
  }
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
//
// Stays in JS (not ported to Kotlin): this is a pure, synchronous helper
// called from many unrelated, non-network call sites throughout the app
// (App.tsx, unifiedCatalog.ts, storeLogic.ts) -- forcing it through an
// async native bridge would be a real regression for every one of those
// call sites, not a win for any of them.
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
//
// Stays in JS (not ported to Kotlin): a pure synchronous combinator over
// two already-resolved GfnGame[] arrays from two entirely separate native
// modules (this file's own owned-games result, and gfnPublicGames.ts's
// unrelated native module) -- it never touches the network itself, so
// there's nothing here for native to speed up.
export const mergeOwnedGames = (
  publicGames: GfnGame[],
  ownedGames: GfnGame[],
): GfnGame[] => {
  if (ownedGames.length === 0) {
    return publicGames;
  }
  const ownedById = new Map(ownedGames.map(g => [g.id, g]));
  // Fallback for when the same app's variant id differs between the owned-
  // library and browse-catalog responses -- keyed by store too, not title
  // alone: a title cross-listed on more than one store (Steam + Epic + GOG,
  // say) must only match the specific store variant actually owned, not
  // every other store's separate (unowned) listing of the same title. A
  // title-only key previously let owning e.g. the Steam copy mark that same
  // title's Epic/GOG entries owned too, even though GFN ownership is
  // per-linked-store-account, not per-title.
  const ownedByStoreTitle = new Map(
    ownedGames.map(g => [`${g.store}:${normalizeTitle(g.title)}`, g]),
  );

  const merged = publicGames.map(g => {
    const owned =
      ownedById.get(g.id) ??
      ownedByStoreTitle.get(`${g.store}:${normalizeTitle(g.title)}`);
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
      subscription: owned.subscription ?? g.subscription,
      steamAppId: g.steamAppId ?? owned.steamAppId,
    };
  });

  const presentTitles = new Set(merged.map(g => normalizeTitle(g.title)));
  const extras = ownedGames.filter(
    g => !presentTitles.has(normalizeTitle(g.title)),
  );

  return [...merged, ...extras];
};

export type GfnLinkedStore = {
  // GFN's own store id, e.g. "STEAM", "XBOX", "EPIC" -- the same uppercase
  // value already seen on owned-game variants and the exact string the
  // account-linking sync API (features/gfn-session's syncGfnStoreConnection)
  // expects as its platform argument -- both read this same field off the
  // same account, so there's nothing to translate between the two.
  store: string;
  syncedGameCount?: number;
};

// The signed-in account's linked stores (Steam, Xbox, Epic, ...), for
// triggering a GFN-side resync of each -- see syncGfnStoreConnection.
// Returns [] on any failure, same as this file's other list-shaped fetches.
export const fetchGfnLinkedStores = async (
  token: string,
): Promise<GfnLinkedStore[]> => {
  try {
    return ((await CatalogGfnModule?.getLinkedStores(token)) ??
      []) as GfnLinkedStore[];
  } catch {
    return [];
  }
};
