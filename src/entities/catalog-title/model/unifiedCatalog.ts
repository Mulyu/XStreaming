import {GfnGame} from '../api/gfnPublicGames';
import {normalizeTitle} from '../api/gfnCatalog';
import type {
  WishlistEntry,
  WishlistRefs,
  WishlistSnapshot,
} from './wishlistLogic';

// Merges xCloud's title list, GFN's (public + owned) game list, and PS
// Plus's (pscloud) cloud-streaming catalog into one grid's worth of titles,
// grouped by normalized name. A title with entries on more than one service
// carries all of them; the Library screen only needs to know which services
// a title is on, and defers picking one (and, for GFN, picking a store) to
// the title's own detail screen.

export type CatalogTitle = {
  // Normalized title -- the identity used both to group entries here and to
  // key a remembered per-game provider/store preference.
  key: string;
  title: string;
  imageUrl?: string;
  genres: string[];
  xcloud?: {
    // Passed straight through to the existing TitleDetail screen, which
    // already knows how to turn it into a stream -- this module never needs
    // to understand xCloud's title shape beyond the few fields read below.
    raw: any;
    hasEntitlement: boolean;
  };
  gfn?: {
    // One entry per linked store (Steam, Epic, Xbox, ...) -- each is an
    // independently launchable CloudMatch app id.
    variants: GfnGame[];
  };
  psplus?: {
    // `entities` sits below `features` in FSD's layer order, so this can't
    // import the real CloudGame type from features/ps-plus-session -- same
    // reason xcloud's own row above is an untyped `raw`. Unlike gfn, PS Plus
    // has no concept of "the same game linked through several stores"; one
    // catalog row is one launchable game.
    raw: any;
    isOwned: boolean;
    // True when this title is in the signed-in account's PS Plus Extra/
    // Premium subscription catalog (libchiaki's own CloudGame.plusCatalog) --
    // i.e. streamable/playable at no extra cost purely from the active Plus
    // tier, independent of `isOwned` (an actual purchase/entitlement). A
    // title can be both (owned AND currently in the Plus catalog).
    inPlusCatalog: boolean;
  };
  // Only on a title the loaded catalogs don't contain (one that can't be
  // streamed, or whose catalog isn't loaded): the ids and last-seen price it
  // was wishlisted with, which is all the Library/detail screens have to show
  // for it. Never set on a title built from a streaming catalog.
  store?: {
    refs: WishlistRefs;
    snapshot?: WishlistSnapshot;
  };
};

const xcloudImageUrl = (item: any): string | undefined => {
  const url = item?.Image_Tile?.URL ?? item?.Image_Poster?.URL;
  return url ? 'https:' + url : undefined;
};

const xcloudGenres = (item: any): string[] => {
  const genres = item?.LocalizedCategories ?? item?.Categories;
  return Array.isArray(genres) ? genres : [];
};

// What the account's subscriptions allow right now. `xboxActive: false` (the
// Game Pass membership lapsed) makes a title's Xbox side read as not owned,
// whatever the title list still says (and the GFN listings that Game Pass
// provides stop counting as owned) -- except a game bought outside Game Pass,
// which xCloud streams for free with ads (see playableWithAds); `psPlusActive: false` does the same for the PS side (owned
// games included, as PS cloud streaming needs Plus too). Left out, each means
// active.
export type CatalogOptions = {xboxActive?: boolean; psPlusActive?: boolean};

// xCloud's program for playing a game the account bought, without Game Pass,
// in exchange for ads. The title list names it in the account's own programs
// for the title (`userPrograms`), next to the Game Pass ones when it has those.
const AD_SUPPORTED_PROGRAM = 'FERDINAND';

const playableWithAds = (item: any): boolean =>
  Array.isArray(item?.details?.userPrograms) &&
  item.details.userPrograms.includes(AD_SUPPORTED_PROGRAM);

const xcloudEntitled = (item: any, opts: CatalogOptions): boolean =>
  item?.details?.hasEntitlement === true &&
  (opts.xboxActive !== false || playableWithAds(item));

export const buildUnifiedCatalog = (
  xcloudTitles: any[],
  gfnGames: GfnGame[],
  psPlusGames: any[] = [],
  opts: CatalogOptions = {},
): CatalogTitle[] => {
  const byKey = new Map<string, CatalogTitle>();

  for (const item of xcloudTitles ?? []) {
    const title: string | undefined = item?.ProductTitle?.trim();
    if (!title) {
      continue;
    }
    const key = normalizeTitle(title);
    const entry = byKey.get(key) ?? {
      key,
      title,
      genres: xcloudGenres(item),
    };
    entry.imageUrl = entry.imageUrl ?? xcloudImageUrl(item);
    if (entry.genres.length === 0) {
      entry.genres = xcloudGenres(item);
    }
    entry.xcloud = {
      raw: item,
      hasEntitlement: xcloudEntitled(item, opts),
    };
    byKey.set(key, entry);
  }

  for (const game of gfnGames ?? []) {
    const title = game.title?.trim();
    if (!title) {
      continue;
    }
    const key = normalizeTitle(title);
    const entry = byKey.get(key) ?? {
      key,
      title,
      genres: game.genres ?? [],
    };
    entry.imageUrl = entry.imageUrl ?? game.imageUrl;
    if (entry.genres.length === 0 && game.genres?.length) {
      entry.genres = game.genres;
    }
    entry.gfn = entry.gfn ?? {variants: []};
    // A listing that exists only through Game Pass is owned only while the
    // membership runs (the same rule as the Xbox side).
    entry.gfn.variants.push(
      opts.xboxActive === false &&
        game.owned &&
        game.subscription === 'XBOX_GAME_PASS'
        ? {...game, owned: false}
        : game,
    );
    byKey.set(key, entry);
  }

  for (const game of psPlusGames ?? []) {
    const title: string | undefined = game?.name?.trim();
    if (!title) {
      continue;
    }
    const key = normalizeTitle(title);
    const entry = byKey.get(key) ?? {
      key,
      title,
      genres: [],
    };
    entry.imageUrl = entry.imageUrl ?? game.imageUrl;
    // PS cloud streaming needs a running Plus membership, owned game or not.
    const plusOn = opts.psPlusActive !== false;
    entry.psplus = {
      raw: game,
      isOwned: plusOn && game?.isOwned === true,
      inPlusCatalog: plusOn && game?.plusCatalog === true,
    };
    byKey.set(key, entry);
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
};

// Whether a title is actually playable right now via at least one of its
// listed services -- Game Pass entitlement on xCloud, an owned store variant
// on GFN, or an owned/entitled game OR a currently-in-catalog (no extra cost)
// game on PS Plus -- as opposed to merely being present in the catalog.
export const isCatalogTitleOwned = (item: CatalogTitle): boolean =>
  !!item.xcloud?.hasEntitlement ||
  !!item.gfn?.variants.some(v => v.owned) ||
  !!item.psplus?.isOwned ||
  !!item.psplus?.inPlusCatalog;

// Single-service CatalogTitle builders -- same field construction
// buildUnifiedCatalog does per source, exposed standalone for callers (the
// Store screen) that match one chart entry back to one raw title/game rather
// than merging a whole list.
export const buildXcloudCatalogTitle = (item: any): CatalogTitle | null => {
  const title: string | undefined = item?.ProductTitle?.trim();
  if (!title) {
    return null;
  }
  return {
    key: normalizeTitle(title),
    title,
    imageUrl: xcloudImageUrl(item),
    genres: xcloudGenres(item),
    xcloud: {raw: item, hasEntitlement: item?.details?.hasEntitlement === true},
  };
};

export const buildGfnCatalogTitle = (game: GfnGame): CatalogTitle | null => {
  const title = game.title?.trim();
  if (!title) {
    return null;
  }
  return {
    key: normalizeTitle(title),
    title,
    imageUrl: game.imageUrl,
    genres: game.genres ?? [],
    gfn: {variants: [game]},
  };
};

// `entities` can't import the real CloudGame type from features/ps-plus-
// session (FSD layer order) -- same reason the `psplus.raw` field on
// CatalogTitle itself is untyped `any`. Used by the Store screen to match one
// PS Store chart entry back to one launchable title, same single-entry role
// buildXcloudCatalogTitle/buildGfnCatalogTitle play for their own charts.
export const buildPsPlusCatalogTitle = (game: any): CatalogTitle | null => {
  const title: string | undefined = game?.name?.trim();
  if (!title) {
    return null;
  }
  return {
    key: normalizeTitle(title),
    title,
    imageUrl: game.imageUrl,
    genres: [],
    psplus: {
      raw: game,
      isOwned: game?.isOwned === true,
      inPlusCatalog: game?.plusCatalog === true,
    },
  };
};

// A wishlisted title that none of the loaded streaming catalogs contain,
// drawn from what was saved when it was added.
export const buildWishlistCatalogTitle = (
  entry: WishlistEntry,
): CatalogTitle => ({
  key: entry.key,
  title: entry.title,
  imageUrl: entry.imageUrl,
  genres: [],
  store: {refs: entry.refs ?? {}, snapshot: entry.snapshot},
});

// What to save when `item` is added to the wishlist. `refs`/`snapshot` come
// from the Store row it was added from; otherwise the ids are read off the
// streaming entries the title already carries.
export const buildWishlistEntry = (
  item: CatalogTitle,
  now: number,
  extra: {refs?: WishlistRefs; snapshot?: WishlistSnapshot} = {},
): WishlistEntry => {
  const refs: WishlistRefs = {
    xbox: item.xcloud?.raw?.productId || item.store?.refs.xbox,
    steam:
      item.gfn?.variants.find(v => v.steamAppId)?.steamAppId ||
      item.store?.refs.steam,
    ps: item.psplus?.raw?.productId || item.store?.refs.ps,
    ...extra.refs,
  };
  (Object.keys(refs) as (keyof WishlistRefs)[]).forEach(k => {
    if (!refs[k]) {
      delete refs[k];
    }
  });
  return {
    key: item.key,
    title: item.title,
    imageUrl: item.imageUrl,
    addedAt: now,
    refs,
    snapshot: extra.snapshot ?? item.store?.snapshot,
  };
};
