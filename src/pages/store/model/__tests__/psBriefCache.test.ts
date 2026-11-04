const store: Record<string, string> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => store[k],
    set: (k: string, v: string) => {
      store[k] = v;
    },
  },
}));

import {readPsBrief, writePsBrief} from '../psBriefCache';

const DAY = 24 * 60 * 60 * 1000;

describe('psBriefCache', () => {
  it('returns what was written for the same locale and product', () => {
    writePsBrief('ja-JP', 'UP1', {genres: ['RPG'], averageRating: 4.5}, 1000);
    expect(readPsBrief('ja-JP', 'UP1', 1000 + DAY)).toEqual({
      genres: ['RPG'],
      averageRating: 4.5,
    });
  });

  it('keeps locales apart (the genre names are localized)', () => {
    writePsBrief('ja-JP', 'UP2', {genres: ['アクション']}, 1000);
    expect(readPsBrief('en-US', 'UP2', 2000)).toBeNull();
  });

  it('expires after a week', () => {
    writePsBrief('ja-JP', 'UP3', {genres: []}, 1000);
    expect(readPsBrief('ja-JP', 'UP3', 1000 + 8 * DAY)).toBeNull();
  });

  it('ignores a corrupt entry', () => {
    store['store.psBrief.ja-JP.UP4'] = '{nope';
    expect(readPsBrief('ja-JP', 'UP4')).toBeNull();
  });
});
