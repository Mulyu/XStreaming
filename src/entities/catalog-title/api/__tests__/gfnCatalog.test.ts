jest.mock('react-native', () => {
  // Mutate the real module's NativeModules in place rather than spreading
  // react-native's own top-level exports: that spread would read (and so
  // eagerly evaluate) every lazy export, including iOS-only native-module
  // getters (e.g. Settings) that fail outside this project's own
  // Android-only jest.setup.js mocking.
  const RN = jest.requireActual('react-native');
  RN.NativeModules.CatalogGfnModule = {
    getOwnedGames: jest.fn(),
    getFullCatalog: jest.fn(),
    getCatalogOrder: jest.fn(),
    getAppDetails: jest.fn(),
    getLinkedStores: jest.fn(),
  };
  return RN;
});

import {NativeModules} from 'react-native';
import {
  normalizeTitle,
  mergeOwnedGames,
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  clearOwnedGames,
  fetchGfnFullCatalog,
  getCachedFullCatalog,
  getGfnFullCatalogStatus,
  clearGfnFullCatalog,
  fetchGfnLinkedStores,
} from '../gfnCatalog';
import {GfnGame} from '../gfnPublicGames';

const mockModule = NativeModules.CatalogGfnModule as {
  getOwnedGames: jest.Mock;
  getFullCatalog: jest.Mock;
  getCatalogOrder: jest.Mock;
  getAppDetails: jest.Mock;
  getLinkedStores: jest.Mock;
};

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation/symbols for ASCII titles', () => {
    expect(normalizeTitle('Overwatch®')).toBe('overwatch');
    expect(normalizeTitle('Monster Hunter Wilds™')).toBe(
      'monster hunter wilds',
    );
  });

  it('collapses case/punctuation differences to the same key', () => {
    expect(normalizeTitle("Marvel's Spider-Man: Remastered")).toBe(
      normalizeTitle("MARVEL'S SPIDER MAN REMASTERED"),
    );
  });

  // Regression: GFN's ja_JP-locale catalog serves titles like
  // "モンスターハンターワイルズ" with no ASCII a-z0-9 characters in them at
  // all. The old ASCII-only pattern replaced every character with a space,
  // normalizing the *entire* title to "" -- collapsing every Japanese-only
  // title in the catalog onto the same key. Confirmed live against a real
  // ja_JP account: Overwatch, Monster Hunter Wilds, and most of the rest of
  // a ~200-title owned library all produced "".
  it('keeps distinct Japanese-only titles distinct instead of collapsing to ""', () => {
    const titles = [
      'オーバーウォッチ®',
      'モンスターハンターワイルズ',
      '崩壊：スターレイル',
      '原神',
      '鳴潮',
    ];
    const normalized = titles.map(normalizeTitle);
    expect(new Set(normalized).size).toBe(titles.length);
    normalized.forEach(key => expect(key).not.toBe(''));
  });

  it('keeps the digits in a title that mixes a non-Latin script with ASCII', () => {
    expect(normalizeTitle('サイバーパンク2077')).toBe('サイバーパンク2077');
  });

  it('still trims and collapses internal whitespace/punctuation runs', () => {
    expect(normalizeTitle('  Foo!!  Bar  ')).toBe('foo bar');
  });
});

describe('mergeOwnedGames', () => {
  const baseGame = (id: string, title: string): GfnGame => ({
    id,
    title,
    store: 'Steam',
    genres: [],
  });
  const ownedGame = (id: string, title: string): GfnGame => ({
    id,
    title,
    store: 'Steam',
    genres: [],
    owned: true,
  });

  it('returns the base list unchanged when there are no owned games', () => {
    const base = [baseGame('1', 'Game A')];
    expect(mergeOwnedGames(base, [])).toBe(base);
  });

  it("marks a base entry owned by id match, keeping the base entry's own title", () => {
    // Real base/owned fetches always share the app's current locale, so
    // their title text for the same id matches too -- only formatting
    // (trademark symbols, etc.) can differ, which is what this covers.
    const base = [baseGame('101595711', 'オーバーウォッチ')];
    const owned = [ownedGame('101595711', 'オーバーウォッチ®')];
    const merged = mergeOwnedGames(base, owned);
    expect(merged).toHaveLength(1);
    expect(merged[0].owned).toBe(true);
    expect(merged[0].title).toBe('オーバーウォッチ');
  });

  // Regression: two distinct Japanese-only-titled base entries must not be
  // treated as the same title just because the (pre-fix) normalized key
  // collided -- each owned game should match (or be appended as an extra
  // for) only its own entry.
  it('keeps two distinct Japanese-only-titled owned games separate', () => {
    const base = [
      baseGame('101595711', 'オーバーウォッチ®'),
      baseGame('102851071', 'モンスターハンターワイルズ'),
    ];
    const owned = [
      ownedGame('101595711', 'オーバーウォッチ®'),
      ownedGame('102851071', 'モンスターハンターワイルズ'),
    ];
    const merged = mergeOwnedGames(base, owned);
    expect(merged).toHaveLength(2);
    expect(merged.every(g => g.owned)).toBe(true);
    expect(new Set(merged.map(g => g.id)).size).toBe(2);
  });

  it('appends an owned game as an extra when the base catalog is missing it', () => {
    const base = [baseGame('1', 'Game A')];
    const owned = [ownedGame('2', 'モンスターハンターワイルズ')];
    const merged = mergeOwnedGames(base, owned);
    expect(merged.map(g => g.title)).toEqual([
      'Game A',
      'モンスターハンターワイルズ',
    ]);
  });

  // Regression: a title cross-listed on more than one store (Steam + Epic,
  // say) previously had ownership spread across every store's listing the
  // moment any one of them matched the owned library by title -- e.g. owning
  // the Steam copy also marked the separate, actually-unowned Epic listing
  // of the same title as owned. GFN ownership is per-linked-store-account,
  // so only the specific owned store variant should ever be marked owned.
  it("does not mark a different store's listing of the same title owned", () => {
    const base = [
      {...baseGame('101', 'Diablo IV'), store: 'Steam'},
      {...baseGame('202', 'Diablo IV'), store: 'Epic'},
    ];
    const owned = [{...ownedGame('101', 'Diablo IV'), store: 'Steam'}];
    const merged = mergeOwnedGames(base, owned);
    const steamEntry = merged.find(g => g.store === 'Steam');
    const epicEntry = merged.find(g => g.store === 'Epic');
    expect(steamEntry?.owned).toBe(true);
    expect(epicEntry?.owned).toBeFalsy();
  });

  // The "library subscription" coverage below used to build its owned-game
  // fixture via toOwnedGames (now native -- see GfnCatalogClient.kt); the
  // same already-mapped shape is written out by hand here instead, since
  // mergeOwnedGames' own contract (carry subscription through from the
  // owned entry) is what this is actually testing.
  it('carries a subscription through from the owned entry', () => {
    const owned: GfnGame[] = [
      {
        id: '101',
        title: 'Halo',
        store: 'XBOX',
        genres: [],
        owned: true,
        subscription: 'XBOX_GAME_PASS',
      },
    ];
    const merged = mergeOwnedGames(
      [{id: '101', title: 'Halo', store: 'XBOX', genres: []}],
      owned,
    );
    expect(merged[0].owned).toBe(true);
    expect(merged[0].subscription).toBe('XBOX_GAME_PASS');
  });
});

describe('fetchGfnOwnedGames', () => {
  beforeEach(() => {
    mockModule.getOwnedGames.mockReset();
    clearOwnedGames();
  });

  it('resolves the games the native module returns', async () => {
    mockModule.getOwnedGames.mockResolvedValue({
      games: [{id: '1', title: 'Game 1', store: 'STEAM', genres: []}],
      complete: true,
    });
    const games = await fetchGfnOwnedGames('token-1');
    expect(games.map(g => g.title)).toEqual(['Game 1']);
    expect(mockModule.getOwnedGames).toHaveBeenCalledWith(
      'token-1',
      expect.any(String),
    );
  });

  it('caches to MMKV only when the native result reports complete: true', async () => {
    mockModule.getOwnedGames.mockResolvedValue({
      games: [{id: '1', title: 'Game 1', store: 'STEAM', genres: []}],
      complete: true,
    });
    await fetchGfnOwnedGames('token-2');
    expect(getFreshOwnedGames()).toEqual([
      {id: '1', title: 'Game 1', store: 'STEAM', genres: []},
    ]);
  });

  it('does not cache a partial result (complete: false)', async () => {
    mockModule.getOwnedGames.mockResolvedValue({
      games: [{id: '1', title: 'Game 1', store: 'STEAM', genres: []}],
      complete: false,
    });
    await fetchGfnOwnedGames('token-3');
    expect(getFreshOwnedGames()).toBeNull();
  });

  it('returns [] and does not throw when the native call rejects', async () => {
    mockModule.getOwnedGames.mockRejectedValue(new Error('native failure'));
    expect(await fetchGfnOwnedGames('token-4')).toEqual([]);
  });
});

describe('fetchGfnFullCatalog', () => {
  beforeEach(() => {
    mockModule.getFullCatalog.mockReset();
    clearGfnFullCatalog();
  });

  it('caches a non-empty result even when the crawl was only partial', async () => {
    mockModule.getFullCatalog.mockResolvedValue({
      games: [{id: '1', title: 'Game 1', store: 'STEAM', genres: []}],
      complete: false,
      totalCount: 5000,
    });
    const result = await fetchGfnFullCatalog('token-1');
    expect(result.complete).toBe(false);
    expect(result.totalCount).toBe(5000);
    expect(getCachedFullCatalog()).toEqual([
      {id: '1', title: 'Game 1', store: 'STEAM', genres: []},
    ]);
    const status = getGfnFullCatalogStatus();
    expect(status?.complete).toBe(false);
    expect(status?.count).toBe(1);
  });

  it('does not cache an empty result, and still records the failed status', async () => {
    mockModule.getFullCatalog.mockRejectedValue(new Error('native failure'));
    const result = await fetchGfnFullCatalog('token-2');
    expect(result.games).toEqual([]);
    expect(result.complete).toBe(false);
    expect(getCachedFullCatalog()).toBeNull();
    const status = getGfnFullCatalogStatus();
    expect(status?.complete).toBe(false);
    expect(status?.count).toBe(0);
  });
});

describe('fetchGfnLinkedStores', () => {
  beforeEach(() => {
    mockModule.getLinkedStores.mockReset();
  });

  it('resolves whatever the native module returns', async () => {
    mockModule.getLinkedStores.mockResolvedValue([
      {store: 'STEAM', syncedGameCount: 42},
      {store: 'XBOX'},
    ]);
    expect(await fetchGfnLinkedStores('token-linked-1')).toEqual([
      {store: 'STEAM', syncedGameCount: 42},
      {store: 'XBOX'},
    ]);
  });

  it('returns [] when the native call rejects', async () => {
    mockModule.getLinkedStores.mockRejectedValue(new Error('offline'));
    expect(await fetchGfnLinkedStores('token-linked-2')).toEqual([]);
  });
});
