const store: Record<string, any> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => store[k],
    getBoolean: (k: string) => store[k],
    set: (k: string, v: any) => {
      store[k] = v;
    },
    delete: (k: string) => {
      delete store[k];
    },
  },
}));
const mockFetch = jest.fn();
jest.mock('../../api/profile', () => ({
  fetchXboxProfile: (...a: any[]) => mockFetch(...a),
}));

import {
  clearXboxProfileCache,
  getCachedXboxProfile,
  loadXboxProfile,
  PROFILE_TTL_MS,
} from '../profileCache';
import {isXboxMembershipActive} from '../membership';

describe('loadXboxProfile', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    mockFetch.mockReset();
  });

  it('fetches once, stores the profile and the membership state', async () => {
    mockFetch.mockResolvedValue({gamertag: 'a', accountTier: 'Silver'});
    expect(await loadXboxProfile({}, 1000)).toEqual({
      gamertag: 'a',
      accountTier: 'Silver',
    });
    expect(getCachedXboxProfile()?.gamertag).toBe('a');
    expect(isXboxMembershipActive()).toBe(false);
  });

  it('serves the cache while it is fresh and refetches once it is old', async () => {
    mockFetch.mockResolvedValue({gamertag: 'a', accountTier: 'Gold'});
    await loadXboxProfile({}, 1000);
    await loadXboxProfile({}, 1000 + PROFILE_TTL_MS - 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await loadXboxProfile({}, 1000 + PROFILE_TTL_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stale cache when the refresh fails', async () => {
    mockFetch.mockResolvedValueOnce({gamertag: 'a', accountTier: 'Gold'});
    await loadXboxProfile({}, 1000);
    mockFetch.mockResolvedValueOnce(null);
    expect(await loadXboxProfile({}, 1000 + PROFILE_TTL_MS * 2)).toEqual({
      gamertag: 'a',
      accountTier: 'Gold',
    });
  });

  it('forgets the profile and the lapsed state on sign-out', async () => {
    mockFetch.mockResolvedValue({gamertag: 'a', accountTier: 'Silver'});
    await loadXboxProfile({}, 1000);
    clearXboxProfileCache();
    expect(getCachedXboxProfile()).toBeNull();
    expect(isXboxMembershipActive()).toBe(true);
  });
});
