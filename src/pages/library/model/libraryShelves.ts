// Pure rules behind the Library home tab's shelves, pulled out of
// useLibraryScreen so they can be unit tested.
import {
  CatalogTitle,
  isCatalogTitleOwned,
} from '../../../entities/catalog-title';

export type LibraryShelves = {
  // Played from this device before, newest first.
  recent: CatalogTitle[];
  // Hearted titles (owned only), alphabetical.
  favorites: CatalogTitle[];
  // Wishlisted titles that are on sale now, biggest discount first.
  wishSale: CatalogTitle[];
};

export const SHELF_LIMIT = 20;

export const buildLibraryShelves = (opts: {
  catalog: CatalogTitle[];
  // Wishlisted titles, including stubs for ones outside the catalog.
  wishlistItems: CatalogTitle[];
  playHistory: Record<string, number>;
  favoriteKeys: Set<string>;
  saleDiscount: (item: CatalogTitle) => number;
  limit?: number;
}): LibraryShelves => {
  const limit = opts.limit ?? SHELF_LIMIT;
  const owned = opts.catalog.filter(isCatalogTitleOwned);
  const recent = owned
    .filter(item => (opts.playHistory[item.key] ?? 0) > 0)
    .sort(
      (a, b) =>
        opts.playHistory[b.key] - opts.playHistory[a.key] ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
  const favorites = owned
    .filter(item => opts.favoriteKeys.has(item.key))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, limit);
  const wishSale = opts.wishlistItems
    .map(item => ({item, discount: opts.saleDiscount(item)}))
    .filter(entry => entry.discount > 0)
    .sort(
      (a, b) =>
        b.discount - a.discount || a.item.title.localeCompare(b.item.title),
    )
    .slice(0, limit)
    .map(entry => entry.item);
  return {recent, favorites, wishSale};
};

export const hasAnyShelf = (shelves: LibraryShelves): boolean =>
  shelves.recent.length > 0 ||
  shelves.favorites.length > 0 ||
  shelves.wishSale.length > 0;
