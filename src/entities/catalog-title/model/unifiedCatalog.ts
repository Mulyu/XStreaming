import {GfnGame} from '../api/gfnPublicGames';
import {normalizeTitle} from '../api/gfnCatalog';

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
};

const xcloudImageUrl = (item: any): string | undefined => {
  const url = item?.Image_Tile?.URL ?? item?.Image_Poster?.URL;
  return url ? 'https:' + url : undefined;
};

const xcloudGenres = (item: any): string[] => {
  const genres = item?.LocalizedCategories ?? item?.Categories;
  return Array.isArray(genres) ? genres : [];
};

export const buildUnifiedCatalog = (
  xcloudTitles: any[],
  gfnGames: GfnGame[],
  psPlusGames: any[] = [],
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
      hasEntitlement: item?.details?.hasEntitlement === true,
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
    entry.gfn.variants.push(game);
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
    entry.psplus = {
      raw: game,
      isOwned: game?.isOwned === true,
      inPlusCatalog: game?.plusCatalog === true,
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
