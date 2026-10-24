import {
  pushRecent,
  recentKey,
  RecentLaunch,
  RECENT_LAUNCH_LIMIT,
} from '../recentList';

const game = (
  name: string,
  extra: Partial<RecentLaunch> = {},
): RecentLaunch => ({
  provider: 'xcloud',
  titleName: name,
  iconUrl: `https://img/${name}.png`,
  productId: name,
  ...extra,
});

describe('recentKey', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(recentKey({titleName: "Baldur's Gate 3"})).toBe(
      recentKey({titleName: 'BALDURS  gate-3'}),
    );
  });

  it('keeps non-latin names distinct', () => {
    expect(recentKey({titleName: 'ペルソナ3'})).not.toBe(
      recentKey({titleName: 'ペルソナ4'}),
    );
  });
});

describe('pushRecent', () => {
  it('puts the newest launch first', () => {
    const list = pushRecent([game('A')], game('B'));
    expect(list.map(g => g.titleName)).toEqual(['B', 'A']);
  });

  it('moves a relaunched game to the front without duplicating it', () => {
    const list = pushRecent([game('A'), game('B'), game('C')], game('C'));
    expect(list.map(g => g.titleName)).toEqual(['C', 'A', 'B']);
  });

  it('treats the same game on another provider as the same entry', () => {
    const list = pushRecent([game('A'), game('B')], {
      provider: 'gfn',
      titleName: 'a',
      iconUrl: '',
      gfnAppId: '9',
    });
    expect(list).toHaveLength(2);
    expect(list[0].provider).toBe('gfn');
  });

  it('keeps the earlier artwork when the relaunch has none', () => {
    const list = pushRecent([game('A')], {
      provider: 'gfn',
      titleName: 'A',
      iconUrl: '',
      gfnAppId: '9',
    });
    expect(list[0].iconUrl).toBe('https://img/A.png');
  });

  it('keeps at most the limit', () => {
    let list: RecentLaunch[] = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      list = pushRecent(list, game(name));
    }
    expect(list).toHaveLength(RECENT_LAUNCH_LIMIT);
    expect(list.map(g => g.titleName)).toEqual(['F', 'E', 'D', 'C']);
  });

  it('ignores an entry with no usable name', () => {
    const list = [game('A')];
    expect(pushRecent(list, game('  '))).toBe(list);
  });
});
