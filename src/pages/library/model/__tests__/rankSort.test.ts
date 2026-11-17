import {
  EMPTY_RANK_TABLE,
  makeRankTable,
  newestScore,
  popularityScore,
  SortTables,
  UNRANKED,
} from '../rankSort';

const empty: SortTables = {
  xcloudPopular: EMPTY_RANK_TABLE,
  xcloudNewest: EMPTY_RANK_TABLE,
  gfnPopular: EMPTY_RANK_TABLE,
  gfnNewest: EMPTY_RANK_TABLE,
};

const xcloud = (productId: string): any => ({
  key: productId,
  title: productId,
  xcloud: {raw: {productId}},
});
const gfn = (...ids: string[]): any => ({
  key: ids[0],
  title: ids[0],
  gfn: {variants: ids.map(id => ({id}))},
});

describe('popularityScore', () => {
  it('compares standing within each list, not raw positions', () => {
    // 5th of 3000 (GFN) is far better than 5th of 50 (xCloud).
    const t: SortTables = {
      ...empty,
      xcloudPopular: makeRankTable({AAA: 5}, 50),
      gfnPopular: makeRankTable({g1: 5}, 3000),
    };
    expect(popularityScore(gfn('g1'), t)).toBeLessThan(
      popularityScore(xcloud('aaa'), t),
    );
  });

  it('uses the best standing across providers', () => {
    const t: SortTables = {
      ...empty,
      xcloudPopular: makeRankTable({AAA: 40}, 50),
      gfnPopular: makeRankTable({g1: 3}, 100),
    };
    const both: any = {...xcloud('aaa'), gfn: gfn('g1').gfn};
    expect(popularityScore(both, t)).toBeCloseTo(0.03);
  });

  it('uppercases the xCloud product id', () => {
    const t: SortTables = {
      ...empty,
      xcloudPopular: makeRankTable({AAA: 0}, 10),
    };
    expect(popularityScore(xcloud('aaa'), t)).toBe(0);
  });

  it('puts unranked titles last', () => {
    expect(popularityScore(xcloud('nope'), empty)).toBe(UNRANKED);
  });
});

describe('newestScore', () => {
  it('prefers release-date lists over GFN added order', () => {
    const t: SortTables = {
      ...empty,
      xcloudNewest: makeRankTable({aaa: 90}, 100),
      gfnNewest: makeRankTable({g1: 0}, 100),
    };
    const both: any = {...xcloud('aaa'), gfn: gfn('g1').gfn};
    // GFN says brand new, but xCloud's real release date wins.
    expect(newestScore(both, t)).toBeCloseTo(0.9);
  });

  it('falls back to GFN added order when nothing else ranks the title', () => {
    const t: SortTables = {...empty, gfnNewest: makeRankTable({g1: 10}, 100)};
    expect(newestScore(gfn('g1'), t)).toBeCloseTo(0.1);
  });
});
