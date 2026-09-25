import {storage} from './mmkv';
import {debugFactory} from '../../utils/debug';
import {NativeModules} from 'react-native';
import {getSystemLocale} from '../../utils/locale';
const log = debugFactory('settingStore');

const STORE_KEY = 'user.settings';

type DisplayOptions = {
  sharpness: number;
  saturation: number;
  contrast: number;
  brightness: number;
};

export type Settings = {
  locale: string;
  locale_follow_system: boolean;
  resolution: number;
  preferred_game_language: string;
  force_region_ip: string;
  signaling_home_name: string;
  signaling_cloud_name: string;
  codec: string;
  vibration: boolean;
  show_harmony_modal: boolean;
  dead_zone: number;
  video_format: string;
  screen_position: string;
  anti_idle_max_minutes: number;
  native_portrait_mode: boolean;
  native_portrait_gamepad_layout: any[];
  native_low_latency_decoder: boolean;
  custom_virtual_gamepad: string;
  gamepad_maping: Record<string, number> | null;
  native_gamepad_maping: Record<string, number> | null;
  polling_rate: number;
  sensor: number;
  sensor_type: number;
  sensor_sensitivity_x: number;
  sensor_sensitivity_y: number;
  sensor_invert: number;
  left_trigger_type: number;
  left_trigger_effects: [];
  right_trigger_type: number;
  right_trigger_effects: [];
  fsr_display_options: DisplayOptions;
  ipv6: boolean;
  check_update: boolean;
  fsr: boolean;
  coop: boolean;
  use_msal_login: boolean;
  enable_microphone: boolean;
  /** In-app game volume (0.0-1.0 in 0.1 steps, 1 = full), applied
   * independently of the Android system volume via the remote audio track's
   * gain. */
  audio_gain: number;
  /** Mute the game audio while the app is in the background. */
  background_mute: boolean;
  /** GeForce NOW streaming resolution, "WxH". */
  gfn_resolution: string;
  /** GeForce NOW streaming frame rate. */
  gfn_fps: number;
  gfn_bitrate_mode: string;
  /** Custom GeForce NOW bitrate in Mbps, used when gfn_bitrate_mode is 'custom'. */
  gfn_bitrate: number;
  /**
   * Pinned GeForce NOW CloudMatch region base URL (from fetchGfnRegions()),
   * empty = auto (nearest region, CloudMatch's own default).
   */
  gfn_region: string;
  /** Multiplier applied to MouseTrackpadZone's per-move finger delta before
   * it's sent -- see components/MouseTrackpadZone.tsx. */
  gfn_mouse_trackpad_sensitivity: number;
};

const defaultSettings: Settings = {
  locale: 'en',
  locale_follow_system: true,
  resolution: 720,
  preferred_game_language: 'en-US',
  force_region_ip: '',
  signaling_home_name: '',
  signaling_cloud_name: '',
  codec: '',
  vibration: true,
  show_harmony_modal: true,
  dead_zone: 0.1,
  video_format: '',
  screen_position: 'center',
  anti_idle_max_minutes: 30,
  native_portrait_mode: false,
  native_portrait_gamepad_layout: [],
  native_low_latency_decoder: false,
  custom_virtual_gamepad: '',
  gamepad_maping: null,
  native_gamepad_maping: null,
  polling_rate: 62.5,
  sensor: 0,
  sensor_type: 1,
  sensor_sensitivity_x: 15000,
  sensor_sensitivity_y: 15000,
  sensor_invert: 0,
  left_trigger_type: 0,
  left_trigger_effects: [],
  right_trigger_type: 0,
  right_trigger_effects: [],
  ipv6: false,
  check_update: true,
  fsr_display_options: {
    sharpness: 2,
    saturation: 5,
    contrast: 5,
    brightness: 5,
  },
  fsr: false,
  coop: false,
  use_msal_login: false,
  enable_microphone: false,
  audio_gain: 1,
  background_mute: true,
  gfn_resolution: '1920x1080',
  gfn_fps: 60,
  gfn_bitrate_mode: 'auto',
  gfn_bitrate: 20,
  gfn_region: '',
  gfn_mouse_trackpad_sensitivity: 1.4,
};

export const saveSettings = (settings: Settings) => {
  log.info('SaveSettings:', settings);
  const totalSettings = Object.assign({}, defaultSettings, settings);
  // AsyncStorage.setItem(STORE_KEY, JSON.stringify(totalSettings));
  storage.set(STORE_KEY, JSON.stringify(totalSettings));
  try {
    // Stereo separation doesn't survive the stream's own latency, so mono
    // is now the only mode -- always force it rather than exposing a toggle.
    NativeModules.AudioSettingModule?.setStereoEnabled?.(false);
    NativeModules.AudioSettingModule?.setLowLatencyDecoderEnabled?.(
      !!totalSettings.native_low_latency_decoder,
    );
  } catch (error) {
    log.warn('sync native settings failed:', error);
  }
};

export const getSettings = (): Settings => {
  let settings = storage.getString(STORE_KEY);
  if (!settings) {
    return {
      ...defaultSettings,
      locale: getSystemLocale(),
      locale_follow_system: true,
    };
  }
  try {
    const _settings = JSON.parse(settings) as Partial<Settings>;
    const hasLocaleFollowSystem = Object.prototype.hasOwnProperty.call(
      _settings,
      'locale_follow_system',
    );
    const merged = Object.assign({}, defaultSettings, _settings);
    merged.locale_follow_system = hasLocaleFollowSystem
      ? !!_settings.locale_follow_system
      : false;
    if (merged.locale_follow_system) {
      merged.locale = getSystemLocale();
    }
    return merged;
  } catch {
    return {
      ...defaultSettings,
      locale: getSystemLocale(),
      locale_follow_system: true,
    };
  }
};

export const resetSettings = () => {
  log.info('resetSettings');
  storage.set(STORE_KEY, JSON.stringify(defaultSettings));
};
