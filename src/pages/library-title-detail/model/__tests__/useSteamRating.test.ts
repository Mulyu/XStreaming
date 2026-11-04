jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {getString: () => undefined, set: () => {}},
}));

import {steamAppIdOf} from '../useSteamRating';
import {CatalogTitle} from '../../../../entities/catalog-title';

const title = (extra: Partial<CatalogTitle>): CatalogTitle => ({
  key: 'k',
  title: 'Game',
  genres: [],
  ...extra,
});

describe('steamAppIdOf', () => {
  it('uses the first GFN variant that is a Steam listing', () => {
    const t = title({
      gfn: {
        variants: [
          {id: 'a', store: 'Epic'},
          {id: 'b', store: 'Steam', steamAppId: '570'},
        ],
      } as any,
    });
    expect(steamAppIdOf(t)).toBe('570');
  });

  it('falls back to the id a Store row carried', () => {
    const t = title({store: {refs: {steam: '730'}, snapshot: {}} as any});
    expect(steamAppIdOf(t)).toBe('730');
  });

  it('is undefined for a title not on Steam', () => {
    expect(steamAppIdOf(title({}))).toBeUndefined();
    expect(steamAppIdOf(undefined)).toBeUndefined();
  });
});
