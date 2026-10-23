const mockStore = new Map<string, string>();
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v),
  },
}));

import {
  XCLOUD_TITLES_TTL_MS,
  getXcloudData,
  isXcloudTitlesFresh,
  saveXcloudData,
  saveXcloudTitles,
} from '../xcloudCache';

describe('xCloud titles freshness', () => {
  beforeEach(() => mockStore.clear());
  afterEach(() => jest.restoreAllMocks());

  it('is stale with nothing stored or an empty list', () => {
    expect(isXcloudTitlesFresh()).toBe(false);
    saveXcloudTitles([]);
    expect(isXcloudTitlesFresh()).toBe(false);
  });

  it('is fresh right after saving titles, stale after the TTL', () => {
    const now = Date.now();
    saveXcloudTitles([{productId: 'A'}]);
    expect(isXcloudTitlesFresh()).toBe(true);
    jest.spyOn(Date, 'now').mockReturnValue(now + XCLOUD_TITLES_TTL_MS + 1);
    expect(isXcloudTitlesFresh()).toBe(false);
  });

  it('is not made fresh by saving other blob fields', () => {
    saveXcloudData({titles: [{productId: 'A'}], releaseDates: {}});
    expect(isXcloudTitlesFresh()).toBe(false);
  });

  it('reuses the parsed blob until the stored value changes', () => {
    saveXcloudTitles([{productId: 'A'}]);
    const first = getXcloudData();
    expect(getXcloudData()).toBe(first);
    saveXcloudTitles([{productId: 'B'}]);
    expect(getXcloudData()).not.toBe(first);
  });
});
