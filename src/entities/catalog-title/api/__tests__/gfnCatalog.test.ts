import {normalizeTitle, mergeOwnedGames} from '../gfnCatalog';
import {GfnGame} from '../gfnPublicGames';

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
});
