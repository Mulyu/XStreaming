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

const ALL = getProviderScope(false, false, false);
const XBOX = getProviderScope(true, false, false);
const PS = getProviderScope(false, false, true);
const GFN = getProviderScope(false, true, false);

describe('getProviderScope', () => {
  it('looks at every provider when no chip is on', () => {
    expect(ALL).toEqual({xcloud: true, gfn: true, psplus: true});
  });

  it('looks at only the chips that are on (several allowed)', () => {
    expect(XBOX).toEqual({xcloud: true, gfn: false, psplus: false});
    expect(getProviderScope(true, false, true)).toEqual({
      xcloud: true,
      gfn: false,
      psplus: true,
    });
  });
});

describe('bestSale', () => {
  const sale = {
    xbox: 30,
    gfn: 0,
    ps: 70,
    snapshot: 0,
    snapshotProvider: null,
  } as const;

  it('takes the biggest discount among all services when none is picked', () => {
    expect(bestSale(sale, ALL)).toEqual({percent: 70, provider: 'ps'});
  });

  it('ignores a bigger PlayStation sale when only Xbox is picked', () => {
    expect(bestSale(sale, XBOX)).toEqual({percent: 30, provider: 'xbox'});
  });

  it('is zero (no badge, last in the discount order) when the picked service has no sale', () => {
    expect(bestSale(sale, GFN).percent).toBe(0);
    expect(bestSale({...sale, xbox: 0}, XBOX).percent).toBe(0);
  });

  it('keeps the biggest of several picked services', () => {
    expect(
      bestSale({...sale, gfn: 50}, getProviderScope(false, true, true)),
    ).toEqual({percent: 70, provider: 'ps'});
  });

  it('leaves out a saved wishlist price from a service that is not picked', () => {
    const saved = {
      xbox: 0,
      gfn: 0,
      ps: 0,
      snapshot: 40,
      snapshotProvider: 'ps' as const,
    };
    expect(bestSale(saved, XBOX).percent).toBe(0);
    expect(bestSale(saved, PS)).toEqual({percent: 40, provider: 'ps'});
    // A saved price whose service is unknown always counts.
    expect(bestSale({...saved, snapshotProvider: null}, XBOX).percent).toBe(40);
  });
});

describe('catalogAvailable / inScopedCatalog', () => {
  it('has no catalog when only GeForce NOW is looked at', () => {
    expect(catalogAvailable(GFN)).toBe(false);
    expect(catalogAvailable(XBOX)).toBe(true);
    expect(catalogAvailable(PS)).toBe(true);
  });

  const gamePassMap = {PRODUCT1: true} as Record<string, true>;
  const gamePassTitle: any = {
    key: 'a',
    title: 'A',
    xcloud: {raw: {productId: 'PRODUCT1'}, hasEntitlement: false},
  };
  const psCatalogTitle: any = {
    key: 'b',
    title: 'B',
    psplus: {raw: {}, isOwned: false, inPlusCatalog: true},
  };

  it('counts Game Pass only with Xbox looked at, the PS catalog only with PS', () => {
    expect(inScopedCatalog(gamePassTitle, XBOX, gamePassMap)).toBe(true);
    expect(inScopedCatalog(gamePassTitle, PS, gamePassMap)).toBe(false);
    expect(inScopedCatalog(psCatalogTitle, PS, gamePassMap)).toBe(true);
    expect(inScopedCatalog(psCatalogTitle, XBOX, gamePassMap)).toBe(false);
    expect(inScopedCatalog(psCatalogTitle, ALL, gamePassMap)).toBe(true);
  });
});

describe('scopeSortTables', () => {
  const tables: SortTables = {
    xcloudPopular: makeRankTable({P1: 100}, 1000),
    xcloudNewest: makeRankTable({P1: 100}, 1000),
    gfnPopular: makeRankTable({'7': 0}, 1000),
    gfnNewest: makeRankTable({'7': 0}, 1000),
    psPopular: makeRankTable({'n:game': 0}, 1000),
    psNewest: makeRankTable({'n:game': 0}, 1000),
  };
  const title: any = {
    key: 'game',
    title: 'Game',
    xcloud: {raw: {productId: 'P1'}},
    gfn: {variants: [{id: '7'}]},
    psplus: {raw: {name: 'Game'}},
  };

  it("ranks a title by the picked service's list alone", () => {
    // Everything: the PlayStation list puts it at the top.
    expect(newestScore(title, scopeSortTables(tables, ALL))).toBe(0);
    // Xbox only: it sits at 100 / 1000 in xCloud's own list.
    expect(newestScore(title, scopeSortTables(tables, XBOX))).toBeCloseTo(0.1);
    expect(popularityScore(title, scopeSortTables(tables, XBOX))).toBeCloseTo(
      0.1,
    );
  });
});
