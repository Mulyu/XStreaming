import {
  buildGfnStoreRows,
  buildXboxStoreRows,
  dedupeByKey,
  hasMorePages,
} from '../storeLogic';
import {GfnGame} from '../../gfn/publicGames';
import {PriceInfo} from '../../entities/catalog-title';
import {SteamChartEntry} from '../../features/store-charts';

describe('hasMorePages', () => {
  it('returns false once a page comes back empty', () => {
    expect(hasMorePages(0, 100, 5000)).toBe(false);
  });

  it('returns true when totalCount is unknown and the page had entries', () => {
    expect(hasMorePages(25, 25, undefined)).toBe(true);
  });

  it('returns true past the boundary while cumulativeStart is still under totalCount', () => {
    expect(hasMorePages(50, 50, 100)).toBe(true);
  });

  it('returns false once cumulativeStart reaches totalCount', () => {
    expect(hasMorePages(50, 100, 100)).toBe(false);
  });

  // Regression: Steam's search endpoint can return fewer rows than requested
  // even well before the end of the list (confirmed live: 98 of a requested
  // 100 while total_count was still in the thousands). A short page must not
  // be mistaken for the end of results.
  it('keeps paging on a short page that has not reached totalCount', () => {
    expect(hasMorePages(98, 200, 5617)).toBe(true);
  });
});

describe('dedupeByKey', () => {
  it('returns an empty array unchanged', () => {
    expect(dedupeByKey<string>([], k => k)).toEqual([]);
  });

  it('passes through items with no duplicates', () => {
    expect(dedupeByKey(['a', 'b', 'c'], k => k)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the first occurrence and preserves relative order', () => {
    const items = ['a', 'b', 'a', 'c', 'b', 'd'];
    expect(dedupeByKey(items, k => k)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('supports a custom, non-identity key selector', () => {
    const items = ['Apex', 'APEX', 'apex', 'Halo'];
    expect(dedupeByKey(items, k => k.toLowerCase())).toEqual(['Apex', 'Halo']);
  });
});

describe('buildXboxStoreRows', () => {
  const item = (productId: string, title: string) => ({
    ProductTitle: title,
    Image_Tile: {URL: `//img/${productId}.jpg`},
    details: {hasEntitlement: true},
  });

  it('ranks rows by their position in productIds, skipping unmatched ids', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', item('AAA', 'Game A')],
      ['CCC', item('CCC', 'Game C')],
    ]);
    const rows = buildXboxStoreRows(
      ['AAA', 'BBB', 'CCC'],
      xcloudByProductId,
      {},
    );
    expect(rows.map(r => r.id)).toEqual(['AAA', 'CCC']);
    // Rank reflects the original chart position, not the compacted index --
    // BBB (unmatched) leaves a gap rather than shifting CCC up to rank 2.
    expect(rows.map(r => r.rank)).toEqual([1, 3]);
  });

  it('matches productIds case-insensitively against the catalog map', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', item('aaa', 'Game A')],
    ]);
    const rows = buildXboxStoreRows(['aaa'], xcloudByProductId, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('aaa');
  });

  it('formats a sale price with the original price struck through', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', item('AAA', 'Game A')],
    ]);
    const priceMap: Record<string, PriceInfo> = {
      AAA: {listPrice: 5, msrp: 10, currencyCode: 'USD', onSale: true},
    };
    const rows = buildXboxStoreRows(['AAA'], xcloudByProductId, priceMap);
    expect(rows[0].price).toBe('$5.00');
    expect(rows[0].originalPrice).toBe('$10.00');
  });

  it('omits the original price when there is no real discount', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', item('AAA', 'Game A')],
    ]);
    const priceMap: Record<string, PriceInfo> = {
      AAA: {listPrice: 10, msrp: 10, currencyCode: 'USD', onSale: false},
    };
    const rows = buildXboxStoreRows(['AAA'], xcloudByProductId, priceMap);
    expect(rows[0].price).toBe('$10.00');
    expect(rows[0].originalPrice).toBeUndefined();
  });

  // Regression for the keyExtractor bug: two distinct store listings whose
  // titles normalize to the same catalogTitle.key must still produce rows
  // with different, genuinely unique `id`s.
  it('gives two different products the same catalogTitle.key but different ids', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', item('AAA', "Marvel's Spider-Man: Remastered")],
      ['BBB', item('BBB', "MARVEL'S SPIDER MAN REMASTERED")],
    ]);
    const rows = buildXboxStoreRows(['AAA', 'BBB'], xcloudByProductId, {});
    expect(rows).toHaveLength(2);
    expect(rows[0].catalogTitle?.key).toBe(rows[1].catalogTitle?.key);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('skips a matched id whose title is missing (unbuildable catalog title)', () => {
    const xcloudByProductId = new Map<string, any>([
      ['AAA', {ProductTitle: '  '}],
    ]);
    const rows = buildXboxStoreRows(['AAA'], xcloudByProductId, {});
    expect(rows).toEqual([]);
  });
});

describe('buildGfnStoreRows', () => {
  const game = (steamAppId: string, title: string): GfnGame => ({
    id: steamAppId,
    title,
    store: 'Steam',
    genres: [],
    steamAppId,
  });

  const entry = (appId: string, title: string): SteamChartEntry => ({
    appId,
    title,
  });

  it('keeps every chart entry, including ones with no GFN match', () => {
    const rows = buildGfnStoreRows(
      [entry('1', 'Game A'), entry('2', 'Game B'), entry('3', 'Game C')],
      [game('1', 'Game A'), game('3', 'Game C')],
    );
    expect(rows.map(r => r.id)).toEqual(['1', '2', '3']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map(r => !!r.catalogTitle)).toEqual([true, false, true]);
  });

  // Regression for the PR #145 union fix: gfnBaseGames is now [...public,
  // ...fullCatalog], so the same steamAppId can legitimately appear twice.
  // The Map.set overwrite means whichever entry is later in the array wins.
  it('lets a later duplicate steamAppId in gfnBaseGames win the match', () => {
    const first = game('1', 'Game A (public)');
    const second = game('1', 'Game A (full catalog)');
    const rows = buildGfnStoreRows([entry('1', 'Game A')], [first, second]);
    expect(rows).toHaveLength(1);
    expect(rows[0].catalogTitle?.gfn?.variants[0]).toBe(second);
  });

  it('still shows an entry with no steamAppId match at all, with a null catalogTitle', () => {
    const rows = buildGfnStoreRows(
      [entry('999', 'Unmatched')],
      [game('1', 'Game A')],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Unmatched');
    expect(rows[0].catalogTitle).toBeNull();
  });
});
