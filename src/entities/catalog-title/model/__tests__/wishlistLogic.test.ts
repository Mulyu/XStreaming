import {
  WishlistEntry,
  favoritesToWishlist,
  removeEntry,
  snapshotDiscount,
  splitAcquired,
  upsertEntry,
} from '../wishlistLogic';
import {pickSnapshot} from '../../api/wishlistPrices';

const entry = (key: string, extra: Partial<WishlistEntry> = {}) => ({
  key,
  title: key,
  addedAt: 1,
  ...extra,
});

describe('upsertEntry / removeEntry', () => {
  it('appends a new title', () => {
    expect(upsertEntry([entry('a')], entry('b')).map(e => e.key)).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps the original add time and merges ids and fresher data', () => {
    const list = [
      entry('a', {addedAt: 5, refs: {xbox: 'X1'}, imageUrl: 'old.png'}),
    ];
    const next = upsertEntry(
      list,
      entry('a', {
        addedAt: 99,
        refs: {ps: 'P1'},
        snapshot: {price: '¥100', discountPercent: 10},
      }),
    );
    expect(next).toHaveLength(1);
    expect(next[0].addedAt).toBe(5);
    expect(next[0].imageUrl).toBe('old.png');
    expect(next[0].refs).toEqual({xbox: 'X1', ps: 'P1'});
    expect(next[0].snapshot?.price).toBe('¥100');
  });

  it('removes by key', () => {
    expect(removeEntry([entry('a'), entry('b')], 'a').map(e => e.key)).toEqual([
      'b',
    ]);
  });
});

describe('splitAcquired', () => {
  it('moves owned titles out and keeps unknown ones', () => {
    const owned = new Map([
      ['a', true],
      ['b', false],
    ]);
    const {kept, acquired} = splitAcquired(
      [entry('a'), entry('b'), entry('c')],
      owned,
    );
    expect(acquired.map(e => e.key)).toEqual(['a']);
    expect(kept.map(e => e.key)).toEqual(['b', 'c']);
  });
});

describe('favoritesToWishlist', () => {
  const lookup = new Map([
    ['own', {title: 'Own', owned: true}],
    ['want', {title: 'Want', imageUrl: 'w.png', owned: false}],
  ]);

  it('copies only non-owned, catalog-known favorites', () => {
    const next = favoritesToWishlist(['own', 'want', 'gone'], [], lookup, 7);
    expect(next).toEqual([
      {key: 'want', title: 'Want', imageUrl: 'w.png', addedAt: 7},
    ]);
  });

  it('does not duplicate a title already on the wishlist', () => {
    const existing = [entry('want', {addedAt: 1})];
    expect(favoritesToWishlist(['want'], existing, lookup, 7)).toBe(existing);
  });
});

describe('snapshot helpers', () => {
  it('reads the discount, 0 when absent', () => {
    expect(snapshotDiscount(entry('a'))).toBe(0);
    expect(
      snapshotDiscount(entry('a', {snapshot: {discountPercent: 40}})),
    ).toBe(40);
  });

  it('keeps the deepest discount, else the first answer', () => {
    expect(
      pickSnapshot([
        {price: 'A', discountPercent: 10},
        {price: 'B', discountPercent: 40},
        {price: 'C', discountPercent: 20},
      ])?.price,
    ).toBe('B');
    expect(
      pickSnapshot([
        {price: 'A', discountPercent: 0},
        {price: 'B', discountPercent: 0},
      ])?.price,
    ).toBe('A');
    expect(pickSnapshot([])).toBeUndefined();
  });
});
