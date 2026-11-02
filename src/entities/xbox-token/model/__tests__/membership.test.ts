const store: Record<string, boolean> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getBoolean: (k: string) => store[k],
    set: (k: string, v: boolean) => {
      store[k] = v;
    },
  },
}));

import {
  isXboxMembershipActive,
  membershipFromTier,
  recordXboxMembership,
} from '../membership';

describe('xbox membership', () => {
  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
  });

  it('reads the tier', () => {
    expect(membershipFromTier('Gold')).toBe(true);
    expect(membershipFromTier('Silver')).toBe(false);
    expect(membershipFromTier('Other')).toBeNull();
    expect(membershipFromTier(undefined)).toBeNull();
  });

  it('counts as active until a Silver profile is recorded', () => {
    expect(isXboxMembershipActive()).toBe(true);
    expect(recordXboxMembership({accountTier: 'Silver'})).toBe(false);
    expect(isXboxMembershipActive()).toBe(false);
    expect(recordXboxMembership({accountTier: 'Gold'})).toBe(true);
  });

  it('keeps the last state when the profile says nothing', () => {
    recordXboxMembership({accountTier: 'Silver'});
    expect(recordXboxMembership(null)).toBe(false);
    expect(recordXboxMembership({gamertag: 'x'})).toBe(false);
  });
});
