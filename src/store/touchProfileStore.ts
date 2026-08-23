import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';

const log = debugFactory('touchProfileStore');

// Per touch-controller-profile swipe-aim config, keyed by profile name
// ('' = the built-in Default profile).
const SWIPE_KEY = 'user.profileSwipe';
// The profile last used for each game, keyed by the game's titleId.
const GAME_KEY = 'user.gameLastProfile';

export type SwipeConfig = {
  sensitivity: number;
  invertY: boolean;
};

export const DEFAULT_SWIPE: SwipeConfig = {
  sensitivity: 0,
  invertY: false,
};

const readMap = (key: string): Record<string, any> => {
  const raw = storage.getString(key);
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

const writeMap = (key: string, map: Record<string, any>) => {
  storage.set(key, JSON.stringify(map));
};

export const getSwipeConfig = (profileName: string): SwipeConfig => {
  const cfg = readMap(SWIPE_KEY)[profileName || ''];
  return {
    sensitivity: Number(cfg?.sensitivity) || 0,
    invertY: !!cfg?.invertY,
  };
};

export const setSwipeConfig = (profileName: string, cfg: SwipeConfig) => {
  const map = readMap(SWIPE_KEY);
  map[profileName || ''] = {
    sensitivity: Number(cfg.sensitivity) || 0,
    invertY: !!cfg.invertY,
  };
  writeMap(SWIPE_KEY, map);
  log.info('setSwipeConfig:', profileName, map[profileName || '']);
};

export const getLastProfileForGame = (gameId: string): string | null => {
  if (!gameId) {
    return null;
  }
  const value = readMap(GAME_KEY)[gameId];
  return typeof value === 'string' ? value : null;
};

export const setLastProfileForGame = (gameId: string, profileName: string) => {
  if (!gameId) {
    return;
  }
  const map = readMap(GAME_KEY);
  map[gameId] = profileName || '';
  writeMap(GAME_KEY, map);
};
