import {storage} from '../../../shared/lib/mmkv';
import {clearCoverLayouts, copyCoverLayout} from './coverLayout';
import {clearTouchProfiles, copyTouchProfile} from './touchProfile';
import {clearLayouts, copyLayout} from './virtualGamepadLayout';

// The touch controller has no user-managed profiles. There is one default,
// the only thing Settings edits, and every game gets its own copy of it the
// first time it is launched; from then on the game's profile is its own and is
// only changed by customizing the controller inside that game.

// The profile name the default is stored under (all per-profile stores --
// layout, swipe-aim, stick mode, gyro-aim, cover -- are keyed by name).
export const DEFAULT_PROFILE = '__default__';

// The set of games that already have a profile of their own.
const GAMES_KEY = 'user.gameProfiles';
// Set once the profiles made under the old, user-managed scheme are gone.
const MIGRATED_KEY = 'user.gameProfilesV1';

export const gameProfileName = (gameKey: string): string => `game:${gameKey}`;

const readGames = (): Record<string, true> => {
  const raw = storage.getString(GAMES_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

// Before this scheme the user made and switched profiles by hand, and each
// game remembered the last one used. They are dropped once -- the default and
// every game start over from the built-in layout.
export const migrateLegacyProfiles = () => {
  if (storage.getString(MIGRATED_KEY)) {
    return;
  }
  clearLayouts();
  clearTouchProfiles();
  clearCoverLayouts();
  storage.delete(GAMES_KEY);
  storage.set(MIGRATED_KEY, '1');
};

const copyProfile = (from: string, to: string) => {
  copyLayout(from, to);
  copyTouchProfile(from, to);
  copyCoverLayout(from, to);
};

// The profile a game plays with. The first time a game is launched it is made
// from the default's current state; after that it is returned as it is. A
// launch with no usable game key (should not happen) plays with the default
// itself.
export const ensureGameProfile = (gameKey: string): string => {
  migrateLegacyProfiles();
  if (!gameKey) {
    return DEFAULT_PROFILE;
  }
  const name = gameProfileName(gameKey);
  const games = readGames();
  if (!games[name]) {
    copyProfile(DEFAULT_PROFILE, name);
    games[name] = true;
    storage.set(GAMES_KEY, JSON.stringify(games));
  }
  return name;
};

// Throws away a game's customizations: its profile is made again from the
// default's current state.
export const resetGameProfile = (gameKey: string): string => {
  if (!gameKey) {
    return DEFAULT_PROFILE;
  }
  const name = gameProfileName(gameKey);
  copyProfile(DEFAULT_PROFILE, name);
  const games = readGames();
  games[name] = true;
  storage.set(GAMES_KEY, JSON.stringify(games));
  return name;
};

// The default profile, for the Settings editor.
export const getDefaultProfile = (): string => {
  migrateLegacyProfiles();
  return DEFAULT_PROFILE;
};
