import {storage} from '../../../shared/lib/mmkv';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('touchProfileStore');

// Per touch-controller-profile swipe-aim config, keyed by profile name
// ('' = the built-in Default profile).
const SWIPE_KEY = 'user.profileSwipe';
// The profile last used for each game, keyed by the game's titleId.
const GAME_KEY = 'user.gameLastProfile';
// Per-profile virtual-stick mode override (0 = fixed, 1 = free). Absent = fall
// back to Free.
const JOYSTICK_KEY = 'user.profileJoystick';
// Per-profile flag: whether the cover-screen controls are enabled (default off).
const COVER_KEY = 'user.profileCover';
// Per-profile gyro-aim config, keyed the same way as swipe-aim above --
// previously a single global setting with no UI to change it at all (see
// SensorModule/GamepadSensorModule's own native startSensor/SensorData), now
// alongside swipe-aim as another per-profile camera-look method.
const SENSOR_KEY = 'user.profileSensor';

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

// Per-profile virtual-stick mode. Returns null when the profile has no
// override, so callers can fall back to the global setting.
export const getJoystickMode = (profileName: string): number | null => {
  const v = readMap(JOYSTICK_KEY)[profileName || ''];
  return v === 0 || v === 1 ? v : null;
};

export const setJoystickMode = (profileName: string, mode: number) => {
  const map = readMap(JOYSTICK_KEY);
  map[profileName || ''] = mode === 0 ? 0 : 1;
  writeMap(JOYSTICK_KEY, map);
};

export type SensorConfig = {
  // 0 = off, 1 = this device's own gyroscope, 2 = a paired controller's own
  // gyroscope (DualSense etc., Android 12L/13+ only -- see
  // GamepadSensorModule).
  mode: number;
  // When the gyroscope actually drives the right stick: 1 = while the left
  // trigger is held, 2 = while the left bumper is held, 3 = either, 4 =
  // always.
  activation: number;
  sensitivityX: number;
  sensitivityY: number;
  // Each independently toggleable, so any combination (e.g. both axes
  // inverted, or swapped *and* one axis inverted) is expressible -- not a
  // single choose-one-combination setting.
  invertX: boolean;
  invertY: boolean;
  swapXY: boolean;
};

const SENSOR_MODES = [0, 1, 2];
const SENSOR_ACTIVATIONS = [1, 2, 3, 4];

export const DEFAULT_SENSOR: SensorConfig = {
  mode: 0,
  activation: 1,
  sensitivityX: 15000,
  sensitivityY: 15000,
  invertX: false,
  invertY: false,
  swapXY: false,
};

const normalizeSensor = (
  cfg: Partial<SensorConfig> | undefined,
): SensorConfig => ({
  mode: SENSOR_MODES.includes(cfg?.mode as number)
    ? (cfg!.mode as number)
    : DEFAULT_SENSOR.mode,
  activation: SENSOR_ACTIVATIONS.includes(cfg?.activation as number)
    ? (cfg!.activation as number)
    : DEFAULT_SENSOR.activation,
  sensitivityX: Number(cfg?.sensitivityX) || DEFAULT_SENSOR.sensitivityX,
  sensitivityY: Number(cfg?.sensitivityY) || DEFAULT_SENSOR.sensitivityY,
  invertX: !!cfg?.invertX,
  invertY: !!cfg?.invertY,
  swapXY: !!cfg?.swapXY,
});

export const getSensorConfig = (profileName: string): SensorConfig =>
  normalizeSensor(readMap(SENSOR_KEY)[profileName || '']);

export const setSensorConfig = (profileName: string, cfg: SensorConfig) => {
  const map = readMap(SENSOR_KEY);
  map[profileName || ''] = normalizeSensor(cfg);
  writeMap(SENSOR_KEY, map);
  log.info('setSensorConfig:', profileName, map[profileName || '']);
};

// Per-profile cover-controls enable flag (default false).
export const getCoverEnabled = (profileName: string): boolean =>
  !!readMap(COVER_KEY)[profileName || ''];

export const setCoverEnabled = (profileName: string, enabled: boolean) => {
  const map = readMap(COVER_KEY);
  map[profileName || ''] = !!enabled;
  writeMap(COVER_KEY, map);
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
