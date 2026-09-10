import {GfnGame} from '../gfn/publicGames';
import {normalizeTitle} from '../gfn/catalog';

// Merges xCloud's title list and GFN's (public + owned) game list into one
// grid's worth of titles, grouped by normalized name. A title with entries on
// both services carries both; the Library screen only needs to know which
// services a title is on, and defers picking one (and, for GFN, picking a
// store) to the title's own detail screen.

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

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
};

// Whether a title is actually playable right now via at least one of its
// listed services -- Game Pass entitlement on xCloud, or an owned store
// variant on GFN -- as opposed to merely being present in the catalog.
export const isCatalogTitleOwned = (item: CatalogTitle): boolean =>
  !!item.xcloud?.hasEntitlement || !!item.gfn?.variants.some(v => v.owned);
