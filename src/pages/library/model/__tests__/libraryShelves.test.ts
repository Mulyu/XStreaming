import {buildLibraryShelves, hasAnyShelf} from '../libraryShelves';

const owned = (key: string, title = key) =>
  ({
    key,
    title,
    genres: [],
    xcloud: {hasEntitlement: true},
  } as any);
const notOwned = (key: string) =>
  ({key, title: key, genres: [], xcloud: {hasEntitlement: false}} as any);

describe('buildLibraryShelves', () => {
  const catalog = [owned('a'), owned('b'), owned('c'), notOwned('n')];
  const base = {
    catalog,
    wishlistItems: [] as any[],
    playHistory: {},
    favoriteKeys: new Set<string>(),
    saleDiscount: () => 0,
  };

  it('is empty with no history, favorites or wishlist', () => {
    expect(hasAnyShelf(buildLibraryShelves(base))).toBe(false);
  });

  it('orders recent by last played and skips unplayed and unowned', () => {
    const s = buildLibraryShelves({
      ...base,
      playHistory: {a: 10, b: 30, c: 20, n: 99, ghost: 5},
    });
    expect(s.recent.map(i => i.key)).toEqual(['b', 'c', 'a']);
  });

  it('keeps only owned favorites, alphabetical', () => {
    const s = buildLibraryShelves({
      ...base,
      catalog: [owned('x', 'Zed'), owned('y', 'Alpha'), notOwned('n')],
      favoriteKeys: new Set(['x', 'y', 'n']),
    });
    expect(s.favorites.map(i => i.title)).toEqual(['Alpha', 'Zed']);
  });

  it('lists wishlist titles on sale by discount, and honours the limit', () => {
    const items = [notOwned('p'), notOwned('q'), notOwned('r')];
    const disc: Record<string, number> = {p: 20, q: 0, r: 50};
    const s = buildLibraryShelves({
      ...base,
      wishlistItems: items,
      saleDiscount: i => disc[i.key],
    });
    expect(s.wishSale.map(i => i.key)).toEqual(['r', 'p']);
    const one = buildLibraryShelves({
      ...base,
      wishlistItems: items,
      saleDiscount: i => disc[i.key],
      limit: 1,
    });
    expect(one.wishSale.map(i => i.key)).toEqual(['r']);
    expect(hasAnyShelf(s)).toBe(true);
  });
});
