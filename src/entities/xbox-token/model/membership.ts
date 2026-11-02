import {storage} from '../../../shared/lib/mmkv';
import type {XboxProfile} from '../api/profile';

const KEY = 'xbox.membership.active';

// Xbox's AccountTier: 'Gold' is an account with a Game Pass (or legacy Gold)
// membership, 'Silver' a free one. Anything else (including a missing tier)
// says nothing either way.
export const membershipFromTier = (tier?: string): boolean | null =>
  tier === 'Gold' ? true : tier === 'Silver' ? false : null;

// The last membership state read from the profile. xCloud only streams for a
// member, so when it is known to have lapsed the Library shows the Xbox side
// of every title as not owned. Unknown (never read, or the read failed) counts
// as active: a failed read must not dim a working library.
export const isXboxMembershipActive = (): boolean =>
  storage.getBoolean(KEY) !== false;

// Forget it (sign-out): a different account starts as active again.
export const clearXboxMembership = (): void => {
  try {
    storage.delete(KEY);
  } catch {}
};

// Remember what a freshly fetched profile says; returns the state now in
// effect.
export const recordXboxMembership = (profile: XboxProfile | null): boolean => {
  const active = membershipFromTier(profile?.accountTier);
  if (active !== null) {
    try {
      storage.set(KEY, active);
    } catch {}
  }
  return isXboxMembershipActive();
};
