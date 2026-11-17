import {
  bestSale,
  catalogAvailable,
  getProviderScope,
  inScopedCatalog,
  scopeSortTables,
} from '../providerScope';
import {
  makeRankTable,
  newestScore,
  popularityScore,
  SortTables,
} from '../rankSort';

const ALL = getProviderScope(false, false);
const XBOX = getProviderScope(true, false);
const GFN = getProviderScope(false, true);

describe('getProviderScope', () => {
  it('looks at every provider when no chip is on', () => {
    expect(ALL).toEqual({xcloud: true, gfn: true});
  });

  it('looks at only the chips that are on (several allowed)', () => {
    expect(XBOX).toEqual({xcloud: true, gfn: false});
    expect(getProviderScope(true, true)).toEqual({
      xcloud: true,
      gfn: true,
    });
  });
});

describe('bestSale', () => {
  const sale = {
    xbox: 30,
    gfn: 70,
    snapshot: 0,
    snapshotProvider: null,
  } as const;

  it('takes the biggest discount among all services when none is picked', () => {
    expect(bestSale(sale, ALL)).toEqual({percent: 70, provider: 'gfn'});
  });

  it('ignores a bigger GFN sale when only Xbox is picked', () => {
    expect(bestSale(sale, XBOX)).toEqual({percent: 30, provider: 'xbox'});
  });

  it('is zero (no badge, last in the discount order) when the picked service has no sale', () => {
    expect(bestSale({...sale, gfn: 0}, GFN).percent).toBe(0);
    expect(bestSale({...sale, xbox: 0}, XBOX).percent).toBe(0);
  });

  it('leaves out a saved wishlist price from a service that is not picked', () => {
    const saved = {
      xbox: 0,
      gfn: 0,
      snapshot: 40,
      snapshotProvider: 'gfn' as const,
    };
    expect(bestSale(saved, XBOX).percent).toBe(0);
    expect(bestSale(saved, GFN)).toEqual({percent: 40, provider: 'gfn'});
    // A saved price whose service is unknown always counts.
    expect(bestSale({...saved, snapshotProvider: null}, XBOX).percent).toBe(40);
  });
});

describe('catalogAvailable / inScopedCatalog', () => {
  it('has no catalog when only GeForce NOW is looked at', () => {
    expect(catalogAvailable(GFN)).toBe(false);
    expect(catalogAvailable(XBOX)).toBe(true);
  });

  const gamePassMap = {PRODUCT1: true} as Record<string, true>;
  const gamePassTitle: any = {
    key: 'a',
    title: 'A',
    xcloud: {raw: {productId: 'PRODUCT1'}, hasEntitlement: false},
  };

  it('counts Game Pass only with Xbox looked at', () => {
    expect(inScopedCatalog(gamePassTitle, XBOX, gamePassMap)).toBe(true);
    expect(inScopedCatalog(gamePassTitle, GFN, gamePassMap)).toBe(false);
    expect(inScopedCatalog(gamePassTitle, ALL, gamePassMap)).toBe(true);
  });
});

describe('scopeSortTables', () => {
  const tables: SortTables = {
    xcloudPopular: makeRankTable({P1: 100}, 1000),
    xcloudNewest: makeRankTable({P1: 100}, 1000),
    gfnPopular: makeRankTable({'7': 0}, 1000),
    gfnNewest: makeRankTable({'7': 0}, 1000),
  };
  const title: any = {
    key: 'game',
    title: 'Game',
    xcloud: {raw: {productId: 'P1'}},
    gfn: {variants: [{id: '7'}]},
  };

  it("ranks a title by the picked service's list alone", () => {
    // Everything: newestScore takes xCloud's own rank outright (GFN is only
    // a fallback for titles xCloud doesn't rank -- see rankSort.ts), while
    // popularityScore takes the better standing of the two.
    expect(newestScore(title, scopeSortTables(tables, ALL))).toBeCloseTo(0.1);
    expect(popularityScore(title, scopeSortTables(tables, ALL))).toBe(0);
    // Xbox only: it sits at 100 / 1000 in xCloud's own list.
    expect(newestScore(title, scopeSortTables(tables, XBOX))).toBeCloseTo(0.1);
    expect(popularityScore(title, scopeSortTables(tables, XBOX))).toBeCloseTo(
      0.1,
    );
  });
});
