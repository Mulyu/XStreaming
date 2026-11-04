const store: Record<string, string> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => store[k],
    set: (k: string, v: string) => {
      store[k] = v;
    },
    delete: (k: string) => {
      delete store[k];
    },
  },
}));
const mockFetch = jest.fn();
jest.mock('../native', () => ({
  psPlusChiaki: {fetchPlusStatus: (...a: any[]) => mockFetch(...a)},
}));

import {
  isPsPlusMembershipActive,
  loadPsPlusMembership,
  plusStatusFromCode,
  PLUS_STATUS_TTL_MS,
} from '../plusStatus';

describe('plusStatusFromCode', () => {
  it('maps the native codes', () => {
    expect(plusStatusFromCode(1)).toBe('active');
    expect(plusStatusFromCode(2)).toBe('lapsed');
    expect(plusStatusFromCode(0)).toBe('unknown');
    expect(plusStatusFromCode(undefined)).toBe('unknown');
  });
});

describe('PS Plus membership state', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    mockFetch.mockReset();
    store['psplus.npsso'] = 'tok';
  });

  it('counts as active until a lapsed read is stored', async () => {
    expect(isPsPlusMembershipActive()).toBe(true);
    mockFetch.mockResolvedValue(2);
    expect(await loadPsPlusMembership(1000)).toBe('lapsed');
    expect(isPsPlusMembershipActive()).toBe(false);
  });

  it('reads at most once an hour', async () => {
    mockFetch.mockResolvedValue(1);
    await loadPsPlusMembership(1000);
    await loadPsPlusMembership(1000 + PLUS_STATUS_TTL_MS - 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await loadPsPlusMembership(1000 + PLUS_STATUS_TTL_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps a lapsed answer when a later read comes back unknown or fails', async () => {
    mockFetch.mockResolvedValueOnce(2);
    await loadPsPlusMembership(1000);
    mockFetch.mockResolvedValueOnce(0);
    expect(await loadPsPlusMembership(1000 + PLUS_STATUS_TTL_MS)).toBe(
      'lapsed',
    );
    mockFetch.mockRejectedValueOnce(new Error('x'));
    expect(await loadPsPlusMembership(1000 + PLUS_STATUS_TTL_MS * 3)).toBe(
      'lapsed',
    );
  });

  it('ignores a state read for another account', async () => {
    mockFetch.mockResolvedValue(2);
    await loadPsPlusMembership(1000);
    store['psplus.npsso'] = 'someone-else';
    expect(isPsPlusMembershipActive()).toBe(true);
  });

  it('does nothing when signed out', async () => {
    delete store['psplus.npsso'];
    expect(await loadPsPlusMembership(1000)).toBe('unknown');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
