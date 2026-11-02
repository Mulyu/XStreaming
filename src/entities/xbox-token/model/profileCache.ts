import {storage} from '../../../shared/lib/mmkv';
import {fetchXboxProfile, XboxProfile} from '../api/profile';
import {clearXboxMembership, recordXboxMembership} from './membership';

const KEY = 'xbox.profile.cache';

// The profile (gamertag, membership tier) changes rarely, so screens that ask
// for it on every focus read it from here and only go to the network once it
// is an hour old.
export const PROFILE_TTL_MS = 60 * 60 * 1000;

type Cached = {profile: XboxProfile; ts: number};

const read = (): Cached | null => {
  try {
    const raw = storage.getString(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && parsed.profile && typeof parsed.ts === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

// The last profile read, however old -- for showing something at once while a
// refresh runs.
export const getCachedXboxProfile = (): XboxProfile | null =>
  read()?.profile ?? null;

// Dropped on sign-out, so the next account never sees the previous one's
// gamertag or lapsed state.
export const clearXboxProfileCache = (): void => {
  try {
    storage.delete(KEY);
  } catch {}
  clearXboxMembership();
};

// The profile for `webToken`: the cached one while it is fresh, otherwise a
// new read (stored, and the membership state updated from it). A failed read
// falls back to the stale cache rather than showing nothing.
export const loadXboxProfile = async (
  webToken: any,
  now: number = Date.now(),
): Promise<XboxProfile | null> => {
  const cached = read();
  if (cached && now - cached.ts < PROFILE_TTL_MS) {
    return cached.profile;
  }
  const profile = await fetchXboxProfile(webToken);
  if (!profile) {
    return cached?.profile ?? null;
  }
  try {
    storage.set(KEY, JSON.stringify({profile, ts: now}));
  } catch {}
  recordXboxMembership(profile);
  return profile;
};
