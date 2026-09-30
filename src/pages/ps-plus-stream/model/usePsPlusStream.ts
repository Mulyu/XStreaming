import React from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Dimensions,
  NativeEventEmitter,
  NativeModules,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import {useTranslation} from 'react-i18next';
import {
  PsPlusSession,
  PsPlusConnectionState,
  StreamMetrics,
  getNpsso,
} from '../../../features/ps-plus-session';
import {GAMEPAD_MAPING} from '../../../entities/gamepad';
import {
  getJoystickMode,
  setJoystickMode,
  getSwipeConfig,
  setSwipeConfig,
  getSensorConfig,
  setSensorConfig,
  getVirtualGamepadLayouts as getGamepadLayouts,
  saveVirtualGamepadLayout as saveGamepadLayout,
  deleteVirtualGamepadLayout as deleteGamepadProfile,
  buildDefaultLayout,
  createDefaultSwipePad,
  SWIPE_AIM_NAME,
  getCoverEnabled,
  getCoverLayout,
  coverGamepadBus,
} from '../../../features/controller-customization';
import type {
  ButtonConfig,
  SensorConfig,
  SwipeConfig,
} from '../../../features/controller-customization';
import {getSettings, saveSettings} from '../../../shared/lib/settings';
import {debugFactory} from '../../../shared/lib/debug';

const {FullScreenManager, GamepadManager, CoverDisplayManager} = NativeModules;

// Exactly native-stream's own VIDEO_FORMAT_OPTIONS -- '' is "Auto" (native
// aspect, 16:9 for every PS Plus resolution preset), then a fill-exact
// stretch, a fill-and-crop zoom, then fixed target aspect ratios (each
// letterboxed/pillarboxed, never cropped). See PsPlusStreamView.kt's
// onLayout() for how each of these is actually applied.
const VIDEO_FORMAT_OPTIONS = [
  '',
  'Stretch',
  'Zoom',
  '16:10',
  '18:9',
  '20:9',
  '21:9',
  '4:3',
];

// keyCode -> button name, same convention native-stream's own gpMaping uses:
// the user's saved custom mapping (shared across every streaming provider,
// including this one) if they set one, else the stock Android gamepad
// key-code mapping.
const buildKeyMap = (): Record<number, string> => {
  const custom = getSettings().native_gamepad_maping;
  const source =
    custom && Object.keys(custom).length > 0 ? custom : GAMEPAD_MAPING;
  const map: Record<number, string> = {};
  for (const [name, code] of Object.entries(source)) {
    map[code as number] = name;
  }
  return map;
};

const normaliseAxis = (value: number): number => {
  const deadZone = getSettings().dead_zone;
  if (!deadZone) {
    return value;
  }
  if (Math.abs(value) < deadZone) {
    return 0;
  }
  const sign = Math.sign(value);
  return (value - sign * deadZone) / (1 - deadZone);
};

// Below this magnitude a game's own analog-stick dead zone (commonly 10-15%)
// swallows the input entirely, so a slow, deliberate small swipe can end up
// doing nothing even though some movement was reported. Once a swipe
// produces any output at all, floor it above that dead zone and scale the
// rest of the range up to fill the gap -- exactly native-stream's own
// shapeSwipeAim.
const SWIPE_AIM_DEADZONE_FLOOR = 0.2;
const shapeSwipeAim = (v: number): number => {
  const clamped = Math.max(-1, Math.min(1, v));
  if (clamped === 0) {
    return 0;
  }
  const magnitude =
    SWIPE_AIM_DEADZONE_FLOOR +
    (1 - SWIPE_AIM_DEADZONE_FLOOR) * Math.abs(clamped);
  return Math.sign(clamped) * magnitude;
};

const log = debugFactory('PsPlusStreamScreen');

// The native engine's error_message is often an internal code, or (for a
// Gaikai session-start rejection) the raw JSON error body verbatim --
// {"sessionId":"...","eventCode":"002.2026","name":"noGameForEntitlementId"}
// was shown to a user as-is before this. Map the known ones to something a
// player can actually act on; anything unrecognized still falls through to
// the raw string rather than hiding it.
function friendlyStreamError(
  detail: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  let name = detail;
  try {
    const parsed = JSON.parse(detail);
    if (parsed && typeof parsed.name === 'string') {
      name = parsed.name;
    }
  } catch {
    // Not JSON -- one of the bare internal codes below, or already a
    // human-readable sentence from the native layer.
  }
  // "PING_TIMEOUT" is a misnomer carried over from the native layer -- it's
  // not a wait-longer timeout, it's cloudsession_gaikai.c's datacenter
  // auto-select gate: every datacenter ping failed outright
  // ("PING_TIMEOUT:UNREACHABLE"), or the best one measured over the 80ms
  // quality gate ("PING_TIMEOUT:<rtt>ms"). Neither is fixed by retrying with
  // more patience, so show what was actually measured instead of "timed out".
  if (name.startsWith('PING_TIMEOUT')) {
    const rtt = name.split(':')[1];
    if (rtt === 'UNREACHABLE') {
      return t('PsPlusErrorPingUnreachable');
    }
    const rttMs = Number(rtt);
    if (Number.isFinite(rttMs)) {
      return t('PsPlusErrorPingTooHigh', {rtt: rttMs});
    }
    return t('PsPlusErrorPingTimeout');
  }
  switch (name) {
    case 'noGameForEntitlementId':
      return t('PsPlusErrorNoGameForEntitlement');
    case 'PS_PLUS_SUBSCRIPTION_REQUIRED':
      return t('PsPlusErrorSubscriptionRequired');
    case 'AUTHORIZATION_FAILED':
      return t('PsPlusErrorAuthExpired');
    default:
      return detail;
  }
}

// Xbox-shaped controller state, matching what gpStateToPsPlusInput (see
// features/ps-plus-session) reads -- the same field names native-stream's
// own gpState uses, so the shared VirtualGamepad UI component (built for
// that shape) can drive this screen unmodified.
const createGpState = () => ({
  A: 0,
  B: 0,
  X: 0,
  Y: 0,
  LeftShoulder: 0,
  RightShoulder: 0,
  View: 0,
  Menu: 0,
  LeftThumb: 0,
  RightThumb: 0,
  DPadUp: 0,
  DPadDown: 0,
  DPadLeft: 0,
  DPadRight: 0,
  Nexus: 0,
  LeftTrigger: 0,
  RightTrigger: 0,
  LeftThumbXAxis: 0,
  LeftThumbYAxis: 0,
  RightThumbXAxis: 0,
  RightThumbYAxis: 0,
});

export function usePsPlusStream(navigation: any, route: any) {
  const {t} = useTranslation();
  const params = route.params ?? {};
  const [connectState, setConnectState] =
    React.useState<PsPlusConnectionState>('connecting');
  const [progressText, setProgressText] = React.useState('');
  const [errorDetail, setErrorDetail] = React.useState('');
  const [pinRequest, setPinRequest] = React.useState<{
    pinIncorrect: boolean;
  } | null>(null);

  // In-game settings rail: opened by the DualSense chord chiaki itself
  // recognizes (OPTIONS+SHARE -> PsChordEvent, the purpose-built equivalent
  // of a system PS-button menu on a cloud session), a long-press of a
  // physical or virtual Menu button (same UX native-stream's own
  // controller-driven menu uses), or the on-screen button PsPlusStreamView
  // renders for touch-only players.
  const [showControlRail, setShowControlRail] = React.useState(false);
  const openControlRail = React.useCallback(() => setShowControlRail(true), []);
  const closeControlRail = React.useCallback(
    () => setShowControlRail(false),
    [],
  );

  // The saved on-screen gamepad profile/layout and its joystick mode --
  // shared with every other streaming provider (native-stream reads the
  // exact same setting), so a profile made for xCloud/GFN carries straight
  // over here instead of PS Plus always rendering the built-in default.
  const [activeProfile, setActiveProfile] = React.useState(
    () => getSettings().custom_virtual_gamepad || '',
  );
  // Bumped by the in-place gamepad editor below on every profile switch/
  // create/delete/save, so activeJoystickMode (and the on-screen layout
  // itself, via PsPlusStreamView's refreshKey) re-reads storage even when
  // the active profile's *name* didn't change -- e.g. editing the currently-
  // active profile's own layout or joystick mode in place.
  const [gamepadLayoutVersion, setGamepadLayoutVersion] = React.useState(0);
  const joystickMode = React.useMemo(
    () => getJoystickMode(activeProfile) ?? 1,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, gamepadLayoutVersion],
  );

  const [vibrationEnabled, setVibrationEnabled] = React.useState(
    () => getSettings().vibration,
  );
  const onToggleVibration = React.useCallback(() => {
    const next = {...getSettings(), vibration: !getSettings().vibration};
    saveSettings(next);
    setVibrationEnabled(next.vibration);
  }, []);

  const [performanceVisible, setPerformanceVisible] = React.useState(false);
  const [metrics, setMetrics] = React.useState<StreamMetrics | null>(null);
  const onTogglePerformance = React.useCallback(
    () => setPerformanceVisible(v => !v),
    [],
  );

  // In-place gamepad-layout editor: renders the shared VirtualGamepadEditor
  // widget as an overlay within this same stream screen (native-stream's own
  // pattern), rather than navigating to the separate CustomGamepad screen.
  // That screen's onSave/onCancel hardcode a return to the out-of-game
  // Settings flow, and navigating away from this screen at all destroys (and
  // on return, recreates) the native video Surface -- surfaceDestroyed()
  // synchronously blocks on kill_decoder()'s AMediaCodec_stop()+thread_join
  // on the UI thread, which is what made the app appear to freeze whenever a
  // player opened the editor mid-game.
  const [showGamepadEditor, setShowGamepadEditor] = React.useState(false);
  const [editorProfile, setEditorProfile] = React.useState('');
  const [gamepadProfiles, setGamepadProfiles] = React.useState<string[]>([]);

  const refreshGamepadProfiles = React.useCallback(() => {
    setGamepadProfiles(Object.keys(getGamepadLayouts()));
  }, []);

  const onEditGamepadLayout = React.useCallback(() => {
    closeControlRail();
    refreshGamepadProfiles();
    setEditorProfile(activeProfile);
    setShowGamepadEditor(true);
  }, [closeControlRail, refreshGamepadProfiles, activeProfile]);

  const onCancelGamepadEditor = React.useCallback(() => {
    setShowGamepadEditor(false);
  }, []);

  // Switch (or newly select) the live/active layout; '' selects the built-in
  // Default. Mirrors native-stream's own applyActiveProfile.
  const applyActiveProfile = React.useCallback((name: string) => {
    saveSettings({...getSettings(), custom_virtual_gamepad: name});
    setActiveProfile(name);
    setEditorProfile(name);
    setGamepadLayoutVersion(v => v + 1);
    // Cover buttons follow the active touch-controller profile too.
    coverGamepadBus.setLayout(getCoverLayout(name || ''));
  }, []);

  const onSwitchGamepadProfile = React.useCallback(
    (name: string) => applyActiveProfile(name),
    [applyActiveProfile],
  );

  const onCreateGamepadProfile = React.useCallback(
    (rawName: string, copyFrom = '') => {
      const name = rawName.trim();
      if (!name) {
        return;
      }
      const layouts = getGamepadLayouts();
      if (!layouts[name]) {
        const source = copyFrom && layouts[copyFrom];
        const seed: ButtonConfig[] = Array.isArray(source)
          ? source.map((button: ButtonConfig) => ({...button}))
          : (() => {
              const {width, height} = Dimensions.get('window');
              return buildDefaultLayout(width, height);
            })();
        saveGamepadLayout(name, seed);
      }
      refreshGamepadProfiles();
      applyActiveProfile(name);
    },
    [applyActiveProfile, refreshGamepadProfiles],
  );

  const onDeleteGamepadProfile = React.useCallback(
    (name: string) => {
      if (!name) {
        return;
      }
      deleteGamepadProfile(name);
      refreshGamepadProfiles();
      // Fall back to the built-in Default after removing the active profile.
      applyActiveProfile('');
    },
    [applyActiveProfile, refreshGamepadProfiles],
  );

  const onSaveGamepadLayout = React.useCallback(
    (
      layout: ButtonConfig[],
      swipe: SwipeConfig,
      nextJoystickMode: number,
      sensor: SensorConfig,
    ) => {
      const profileName = editorProfile || activeProfile;
      saveGamepadLayout(profileName, layout);
      setSwipeConfig(profileName, swipe);
      setJoystickMode(profileName, nextJoystickMode);
      setSensorConfig(profileName, sensor);
      // A profile edited before anything was ever made active (e.g. the very
      // first customization) becomes the active one.
      const current = getSettings();
      if (!current.custom_virtual_gamepad && profileName) {
        saveSettings({...current, custom_virtual_gamepad: profileName});
        setActiveProfile(profileName);
      }
      setGamepadLayoutVersion(v => v + 1);
      setShowGamepadEditor(false);
    },
    [editorProfile, activeProfile],
  );

  // The profile the editor is (about to be) open for -- its saved swipe-aim/
  // gyro-aim config, so opening the editor shows what's actually configured
  // instead of resetting to defaults on every save.
  const editorSwipeConfig = React.useMemo(
    () => getSwipeConfig(editorProfile || activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorProfile, activeProfile, gamepadLayoutVersion],
  );
  const editorSensorConfig = React.useMemo(
    () => getSensorConfig(editorProfile || activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorProfile, activeProfile, gamepadLayoutVersion],
  );

  React.useEffect(() => {
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    return () => {
      Orientation.lockToPortrait();
      FullScreenManager.immersiveModeOff();
    };
  }, []);

  const sessionRef = React.useRef<PsPlusSession | null>(null);
  const gpState = React.useRef(createGpState());

  const flushGpState = React.useCallback(() => {
    sessionRef.current?.setGamepadState(gpState.current);
  }, []);

  // Swipe-to-aim: shared with native-stream's own implementation -- a
  // trackpad rectangle (placed/sized per-profile in the shared gamepad
  // editor) that translates a finger drag into right-stick (camera)
  // velocity, gated by the profile's own activation scheme (always, or only
  // while the left trigger/bumper is held).
  const activeSwipe = React.useMemo(
    () => getSwipeConfig(activeProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProfile, gamepadLayoutVersion],
  );

  // The swipe-aim trackpad rectangle for the active profile (from its
  // layout; a sensible default when the profile has no SwipeAim element or
  // is Default).
  const activeSwipeRect = React.useMemo(() => {
    const {width, height} = Dimensions.get('window');
    const fallback = createDefaultSwipePad(width, height);
    if (activeProfile) {
      const layout = getGamepadLayouts()[activeProfile];
      const pad = Array.isArray(layout)
        ? layout.find((b: ButtonConfig) => b?.name === SWIPE_AIM_NAME)
        : null;
      if (pad) {
        return pad;
      }
    }
    return fallback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile, gamepadLayoutVersion]);

  // Whether swipe-aim should actually claim/apply a touch right now, per its
  // activation scheme (same scheme as gyro-aim's SensorConfig.activation):
  // always, or only while the configured trigger/bumper is held. Read live
  // off gpState -- not memoized -- so the per-move output gate further
  // below, the swipeAimActive React state synced to it, and SwipeAimZone's
  // own isActive prop all agree with the current button state.
  const isSwipeAimActive = React.useCallback(() => {
    const activation = activeSwipe.activation;
    const deadZone = getSettings().dead_zone || 0;
    if (activation === 4) {
      return true;
    }
    if (activation === 1) {
      return gpState.current.LeftTrigger >= deadZone;
    }
    if (activation === 2) {
      return gpState.current.LeftShoulder > 0;
    }
    return (
      gpState.current.LeftTrigger >= deadZone ||
      gpState.current.LeftShoulder > 0
    );
  }, [activeSwipe.activation]);

  // Mirrors isSwipeAimActive() as React state, kept in sync from the
  // trigger/bumper handlers below -- the trackpad is unmounted outright
  // while inactive (see swipeAimEnabled further down), matching
  // native-stream's own reasoning: a PanResponder that merely declines to
  // become responder didn't reliably let the touch fall through to whatever
  // is underneath it in practice.
  const [swipeAimActive, setSwipeAimActive] = React.useState(false);

  // Re-sync whenever the activation scheme itself changes (e.g. switching
  // profiles, or picking a different activation option in the editor),
  // rather than waiting for the next trigger/bumper press to notice.
  React.useEffect(() => {
    setSwipeAimActive(isSwipeAimActive());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSwipe.activation]);

  const swipeAimResetTimer = React.useRef<ReturnType<typeof setTimeout>>();

  const clearSwipeAim = React.useCallback(() => {
    if (swipeAimResetTimer.current) {
      clearTimeout(swipeAimResetTimer.current);
      swipeAimResetTimer.current = undefined;
    }
    gpState.current.RightThumbXAxis = 0;
    gpState.current.RightThumbYAxis = 0;
    flushGpState();
  }, [flushGpState]);

  const handleSwipeAim = React.useCallback(
    (dx: number, dy: number) => {
      // The touch-capture gate below (SwipeAimZone's isActive prop) already
      // keeps an inactive swipe-aim from claiming a touch at all; this
      // repeats the same check so releasing the trigger mid-swipe stops
      // applying movement immediately too, since a granted gesture keeps
      // delivering move events regardless of activation state.
      if (!isSwipeAimActive()) {
        return;
      }
      const invertY = activeSwipe.invertY;
      gpState.current.RightThumbXAxis = shapeSwipeAim(dx);
      // Screen y is down-positive; a right stick pushed up (look up) is
      // positive, so negate by default. Invert flips it back.
      gpState.current.RightThumbYAxis = shapeSwipeAim(invertY ? dy : -dy);
      flushGpState();
      if (swipeAimResetTimer.current) {
        clearTimeout(swipeAimResetTimer.current);
      }
      swipeAimResetTimer.current = setTimeout(clearSwipeAim, 60);
    },
    [isSwipeAimActive, activeSwipe.invertY, flushGpState, clearSwipeAim],
  );

  // Screen position / aspect ratio / volume: shared with native-stream's own
  // settings.screen_position/video_format/audio_gain (see that screen's
  // handleSetScreenPosition/handleCycleVideoFormat/handleAudioGainChange) --
  // same keys, same behavior, so a preference set on one provider's stream
  // carries over to this one. Calibration-like (tied to the device/display,
  // not the session), so persisted immediately rather than only on exit.
  const [screenPosition, setScreenPositionState] = React.useState(
    () => getSettings().screen_position || 'center',
  );
  const onSetScreenPosition = React.useCallback((position: string) => {
    saveSettings({...getSettings(), screen_position: position});
    setScreenPositionState(position);
  }, []);

  const [videoFormat, setVideoFormatState] = React.useState(
    () => getSettings().video_format || '',
  );
  const onCycleVideoFormat = React.useCallback(() => {
    const currentIndex = VIDEO_FORMAT_OPTIONS.indexOf(
      getSettings().video_format,
    );
    const nextFormat =
      VIDEO_FORMAT_OPTIONS[
        (currentIndex + 1 + VIDEO_FORMAT_OPTIONS.length) %
          VIDEO_FORMAT_OPTIONS.length
      ];
    saveSettings({...getSettings(), video_format: nextFormat});
    setVideoFormatState(nextFormat);
  }, []);

  // Real per-session gain applied natively (see audio-output.h's own
  // comment) -- unlike screen position/video format this also needs a live
  // native call, not just a persisted setting the next connect() reads.
  const [audioGain, setAudioGainState] = React.useState(
    () => getSettings().audio_gain ?? 1,
  );
  const onAudioGainChange = React.useCallback((value: number) => {
    const nextGain = Math.max(0, Math.min(1, Math.round(value * 10) / 10));
    saveSettings({...getSettings(), audio_gain: nextGain});
    setAudioGainState(nextGain);
    sessionRef.current?.setAudioGain(nextGain);
  }, []);

  React.useEffect(() => {
    const npsso = getNpsso();
    if (!npsso) {
      setConnectState('failed');
      setErrorDetail('Not signed in');
      return;
    }
    const session = new PsPlusSession({
      onState: (state, detail) => {
        setConnectState(state);
        if (detail) {
          setErrorDetail(friendlyStreamError(detail, t));
        }
      },
      onProgress: stage => setProgressText(stage),
      onLoginPinRequest: pinIncorrect => setPinRequest({pinIncorrect}),
      // Chiaki's rumble is just the two continuous DualSense motor
      // magnitudes (0-255, no duration/trigger-effect data the way xCloud's
      // WebRTC rumble channel carries) -- the game keeps re-sending them as
      // they change, so a short duration here is a refresh cushion between
      // updates rather than a one-shot pulse. Same GamepadManager.vibrate
      // "native Android rumble" path native-stream falls back to for a
      // non-USB-DualSense controller.
      onRumble: (left, right) => {
        if (!getSettings().vibration) {
          return;
        }
        const strong = Math.min(100, Math.round((left / 255) * 100));
        const weak = Math.min(100, Math.round((right / 255) * 100));
        if (strong <= 0 && weak <= 0) {
          GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
          return;
        }
        GamepadManager.vibrate(120, weak, strong, 0, 0, 3);
      },
      onPsChord: () => openControlRail(),
      // Persisted regardless of whether this attempt succeeded -- a
      // ping-gate rejection is exactly when a fresh measurement is most
      // worth keeping for the Settings datacenter picker and future runs.
      onDatacenterPings: json => {
        saveSettings({...getSettings(), psplus_datacenter_pings: json});
      },
    });
    sessionRef.current = session;
    // The owned-entitlement fast path only means anything on the PSNOW
    // (Kamaji resolve) branch -- cc_kamaji_resolve branches on it, but
    // provision_once's pscloud branch never reads it at all, always using
    // gameIdentifier directly. Sending it for a pscloud launch anyway (Pylux's
    // own client never does -- CloudPlayFragment.kt gates this identically)
    // only trips the one-shot noGameForEntitlement retry into a guaranteed
    // no-op extra round-trip when a PS5 entitlement is rejected.
    const ownedFastPath =
      params.isOwned &&
      params.serviceType === 'psnow' &&
      !!params.entitlementId;
    const videoSettings = getSettings();
    void session.connect({
      npsso,
      serviceType: params.serviceType === 'psnow' ? 'psnow' : 'pscloud',
      gameIdentifier: params.streamIdentifier ?? params.productId ?? '',
      gameName: params.name ?? '',
      ownedEntitlementId: ownedFastPath ? params.entitlementId : undefined,
      ownedPlatform: ownedFastPath ? params.platform : undefined,
      // Was never passed at all, so every session ran on the native
      // default ("en") regardless of this setting -- the same shared
      // preferred_game_language xCloud already exposes in Settings (BCP-47,
      // e.g. "ja-JP"). chiaki_cloud_gaikai_language() (cloudcatalog_consts.c)
      // already takes that exact format and extracts the leading language
      // code itself, so no reformatting is needed here.
      gameLanguage: videoSettings.preferred_game_language || undefined,
      resolution: videoSettings.psplus_resolution,
      fpsPreset: videoSettings.psplus_fps,
      bitrateKbps:
        videoSettings.psplus_bitrate_mode === 'custom'
          ? videoSettings.psplus_bitrate_kbps
          : undefined,
      priorDatacentersJson: videoSettings.psplus_datacenter_pings || undefined,
      audioGain: videoSettings.audio_gain,
    });

    return () => {
      log.info('Closing PS Plus session');
      session.close();
      sessionRef.current = null;
    };
    // Only the initial route params matter -- this effect owns the session
    // for the screen's whole lifetime, same as native-stream's own connect
    // effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Long-pressing Menu opens the in-game settings rail -- same 2s-hold UX
  // native-stream's own physical/virtual Menu button uses, for a profile
  // whose layout doesn't have a dedicated settings button of its own.
  const menuLongPressTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const menuLongPressTriggered = React.useRef(false);

  const handlePressIn = React.useCallback(
    (name: string) => {
      (gpState.current as any)[name] = 1;
      flushGpState();
      if (name === 'LeftTrigger' || name === 'LeftShoulder') {
        setSwipeAimActive(isSwipeAimActive());
      }
      if (name === 'Menu' && !menuLongPressTimer.current) {
        menuLongPressTriggered.current = false;
        menuLongPressTimer.current = setTimeout(() => {
          menuLongPressTimer.current = undefined;
          menuLongPressTriggered.current = true;
          (gpState.current as any).Menu = 0;
          flushGpState();
          openControlRail();
        }, 2000);
      }
    },
    [flushGpState, openControlRail, isSwipeAimActive],
  );

  const handlePressOut = React.useCallback(
    (name: string) => {
      (gpState.current as any)[name] = 0;
      flushGpState();
      if (name === 'LeftTrigger' || name === 'LeftShoulder') {
        setSwipeAimActive(isSwipeAimActive());
      }
      if (name === 'Menu') {
        if (menuLongPressTimer.current) {
          clearTimeout(menuLongPressTimer.current);
          menuLongPressTimer.current = undefined;
        }
        menuLongPressTriggered.current = false;
      }
    },
    [flushGpState, isSwipeAimActive],
  );

  const handleStickMove = React.useCallback(
    (id: string, data: {x: number; y: number}) => {
      if (id === 'right') {
        gpState.current.RightThumbXAxis = data.x;
        gpState.current.RightThumbYAxis = data.y;
      } else {
        gpState.current.LeftThumbXAxis = data.x;
        gpState.current.LeftThumbYAxis = data.y;
      }
      flushGpState();
    },
    [flushGpState],
  );

  // Physical controller (USB/Bluetooth) support, mirroring native-stream's
  // own "normal mode" gamepad wiring (not its separate USB-DualSense-native
  // path, which needs its own low-level rumble/adaptive-trigger protocol --
  // out of scope here) but simplified to one controller/one gpState, since
  // PS Plus has no local-coop/split-screen concept. Feeds the exact same
  // gpState ref and flushGpState the on-screen VirtualGamepad already uses,
  // so both input sources compose for free.
  React.useEffect(() => {
    const keyMap = buildKeyMap();
    const eventEmitter = new NativeEventEmitter();

    const applyDpad = (pressedKeys: number[]) => {
      const active = new Set(pressedKeys ?? []);
      const mapping = getSettings().native_gamepad_maping;
      (['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'] as const).forEach(
        direction => {
          const code = mapping?.[direction];
          const name = code !== undefined ? keyMap[code] : undefined;
          if (name && code !== undefined) {
            (gpState.current as any)[name] = active.has(code) ? 1 : 0;
          }
        },
      );
    };

    const downSub = eventEmitter.addListener('onGamepadKeyDown', event => {
      const name = keyMap[event.keyCode];
      if (!name) {
        return;
      }
      if (name !== 'LeftTrigger' && name !== 'RightTrigger') {
        (gpState.current as any)[name] = 1;
      }
      if (name === 'LeftShoulder') {
        setSwipeAimActive(isSwipeAimActive());
      }
      if (
        name === 'Menu' &&
        !menuLongPressTimer.current &&
        !menuLongPressTriggered.current
      ) {
        menuLongPressTimer.current = setTimeout(() => {
          menuLongPressTimer.current = undefined;
          menuLongPressTriggered.current = true;
          gpState.current.Menu = 0;
          flushGpState();
          openControlRail();
        }, 2000);
      }
      flushGpState();
    });

    const upSub = eventEmitter.addListener('onGamepadKeyUp', event => {
      const name = keyMap[event.keyCode];
      if (!name) {
        return;
      }
      if (name !== 'LeftTrigger' && name !== 'RightTrigger') {
        (gpState.current as any)[name] = 0;
      }
      if (name === 'LeftShoulder') {
        setSwipeAimActive(isSwipeAimActive());
      }
      if (name === 'Menu') {
        if (menuLongPressTimer.current) {
          clearTimeout(menuLongPressTimer.current);
          menuLongPressTimer.current = undefined;
        }
        menuLongPressTriggered.current = false;
      }
      flushGpState();
    });

    const dpadDownSub = eventEmitter.addListener('onDpadKeyDown', event => {
      const pressed = Array.isArray(event.dpadIdxList)
        ? event.dpadIdxList
        : event.dpadIdx >= 0
        ? [event.dpadIdx]
        : [];
      applyDpad(pressed);
      flushGpState();
    });

    const dpadUpSub = eventEmitter.addListener('onDpadKeyUp', () => {
      applyDpad([]);
      flushGpState();
    });

    const stickSub = eventEmitter.addListener('onStickMove', event => {
      gpState.current.LeftThumbXAxis = normaliseAxis(event.leftStickX);
      gpState.current.LeftThumbYAxis = normaliseAxis(event.leftStickY);
      gpState.current.RightThumbXAxis = normaliseAxis(event.rightStickX);
      gpState.current.RightThumbYAxis = normaliseAxis(event.rightStickY);
      flushGpState();
    });

    const triggerSub = eventEmitter.addListener('onTrigger', event => {
      gpState.current.LeftTrigger =
        event.leftTrigger >= 0.05 ? event.leftTrigger : 0;
      gpState.current.RightTrigger =
        event.rightTrigger >= 0.05 ? event.rightTrigger : 0;
      flushGpState();
      setSwipeAimActive(isSwipeAimActive());
    });

    return () => {
      GamepadManager.setCurrentScreen('');
      downSub.remove();
      upSub.remove();
      dpadDownSub.remove();
      dpadUpSub.remove();
      stickSub.remove();
      triggerSub.remove();
      if (menuLongPressTimer.current) {
        clearTimeout(menuLongPressTimer.current);
        menuLongPressTimer.current = undefined;
      }
    };
  }, [flushGpState, openControlRail, isSwipeAimActive]);

  // Foldable cover-display support, shared with native-stream's own
  // implementation: while connected, expose gamepad input to the outer
  // cover surface (a second ReactRootView on this same JS instance, see
  // pages/cover-screen) via the coverGamepadBus singleton, and auto-present
  // it when the device is unfolded during a game.
  const [coverAvailable, setCoverAvailable] = React.useState(false);
  const [coverPresented, setCoverPresented] = React.useState(false);
  const coverPressInRef = React.useRef<(name: string) => void>(() => {});
  const coverPressOutRef = React.useRef<(name: string) => void>(() => {});
  // Set once a manual "Hide" wins over auto-present until re-enabled or the
  // device is re-opened -- mirrors native-stream's own coverHiddenRef.
  const coverHiddenRef = React.useRef(false);
  const connectStateRef = React.useRef(connectState);

  coverPressInRef.current = handlePressIn;
  coverPressOutRef.current = handlePressOut;
  connectStateRef.current = connectState;

  // React to cover present-capability changes (device opened/closed): keep
  // the availability + presented flags in sync and auto-present the cover
  // controls when the device is unfolded during a game, so no manual step is
  // needed.
  const handleCoverStatus = React.useCallback((s: string) => {
    setCoverAvailable(s === 'AVAILABLE' || s === 'ACTIVE');
    setCoverPresented(s === 'ACTIVE');
    if (
      s === 'AVAILABLE' &&
      connectStateRef.current === 'connected' &&
      !coverHiddenRef.current &&
      getCoverEnabled(getSettings().custom_virtual_gamepad || '')
    ) {
      CoverDisplayManager?.present?.('XCoverScreen')?.catch?.(() => {});
    }
  }, []);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'CoverDisplayStatus',
      handleCoverStatus,
    );
    return () => sub.remove();
  }, [handleCoverStatus]);

  // While a stream is connected, expose the gamepad input to the foldable
  // cover-display surface and tell it a game is live; auto-present if the
  // device is already unfolded. Tear down on disconnect.
  React.useEffect(() => {
    if (connectState !== 'connected') {
      return;
    }
    coverHiddenRef.current = false;
    coverGamepadBus.setHandlers({
      onPressIn: name => coverPressInRef.current(name),
      onPressOut: name => coverPressOutRef.current(name),
    });
    // Cover buttons follow the active touch-controller profile.
    coverGamepadBus.setLayout(
      getCoverLayout(getSettings().custom_virtual_gamepad || ''),
    );
    coverGamepadBus.setActive(true);
    CoverDisplayManager?.getStatus?.()
      .then(handleCoverStatus)
      .catch(() => {});
    return () => {
      coverGamepadBus.clearHandlers();
      coverGamepadBus.setActive(false);
      CoverDisplayManager?.dismiss?.();
      setCoverPresented(false);
    };
  }, [connectState, handleCoverStatus]);

  const onToggleCoverControls = React.useCallback(async () => {
    if (coverPresented) {
      // Manual hide: remember it so the auto-present doesn't turn it back on
      // until the user re-enables or the device is re-opened.
      coverHiddenRef.current = true;
      CoverDisplayManager?.dismiss?.();
      setCoverPresented(false);
    } else {
      coverHiddenRef.current = false;
      try {
        await CoverDisplayManager?.present?.('XCoverScreen');
        setCoverPresented(true);
      } catch (e) {
        log.warn('present cover failed:', e);
      }
    }
  }, [coverPresented]);

  // Hands D-pad/remote focus back to normal Android navigation while the
  // rail (or the CustomGamepad screen it navigates to) is up, same as
  // native-stream's own control rail.
  React.useEffect(() => {
    GamepadManager.setCurrentScreen(showControlRail ? '' : 'stream');
  }, [showControlRail]);

  // Live stream stats for the performance overlay -- only polled while both
  // connected and actually visible, since getMetrics() is a native round
  // trip.
  React.useEffect(() => {
    if (!performanceVisible || connectState !== 'connected') {
      setMetrics(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      sessionRef.current?.getMetrics().then(m => {
        if (!cancelled) {
          setMetrics(m);
        }
      });
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [performanceVisible, connectState]);

  const [pin, setPin] = React.useState('');

  const onSubmitPin = React.useCallback(() => {
    sessionRef.current?.setLoginPin(pin);
    setPinRequest(null);
    setPin('');
  }, [pin]);

  // beforeRemove fires again for the goBack() the Confirm button itself
  // triggers -- without this guard, that second GO_BACK hits the exact same
  // listener (connectState hasn't changed yet), which preventDefault()s it
  // and reopens the same confirm dialog, forever: pressing back while
  // connected became unable to actually exit at all.
  const exitConfirmedRef = React.useRef(false);

  const requestExit = React.useCallback(() => {
    // Nothing to confirm leaving once the stream already failed/ended -- the
    // beforeRemove listener below only intercepts GO_BACK while connected
    // anyway, so this "Close" button asking to confirm exiting a stream
    // that isn't running was just a confusing extra tap.
    if (connectState !== 'connected') {
      navigation.goBack();
      return;
    }
    Alert.alert(t('Warning'), t('Exit stream?'), [
      {text: t('Cancel'), style: 'cancel'},
      {
        text: t('Confirm'),
        style: 'destructive',
        onPress: () => {
          exitConfirmedRef.current = true;
          navigation.goBack();
        },
      },
    ]);
  }, [navigation, t, connectState]);

  // A natural session end (the PS5 game itself quitting, not the player
  // disconnecting from here) previously left this screen sitting on the
  // "Stream ended" overlay below, with a Close button that needed D-pad/
  // remote focus to reach -- for a controller-only player there was often no
  // way back at all, exactly matching a report of the game screen staying up
  // with no way to return. native-stream's own equivalent (finishStreamExit)
  // never waits for interaction on a natural disconnect; it navigates away
  // immediately. Mirrors that here via requestExit's own connectState !==
  // 'connected' branch (a plain goBack(), no confirmation). Deliberately NOT
  // applied to 'failed' -- a connection failure's error detail (wrong PIN,
  // subscription required, ping too high, ...) is worth letting the player
  // actually read before leaving.
  React.useEffect(() => {
    if (connectState === 'closed') {
      requestExit();
    }
  }, [connectState, requestExit]);

  React.useEffect(() => {
    const beforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (exitConfirmedRef.current) {
        return;
      }
      if (e.data.action.type === 'GO_BACK' && connectState === 'connected') {
        e.preventDefault();
        requestExit();
      }
    });
    return beforeRemove;
  }, [navigation, connectState, requestExit]);

  const onRailDisconnect = React.useCallback(() => {
    closeControlRail();
    requestExit();
  }, [closeControlRail, requestExit]);

  // CustomVirtualGamepad/VirtualGamepad's swipeAim* props -- see
  // native-stream's own identical derivation.
  const swipeAimSensitivityRaw = Number(activeSwipe.sensitivity) || 0;
  const swipeAimAccelerationRaw = Number(activeSwipe.acceleration) || 0;
  // swipeAimActive (activation gate) folds into this so the trackpad is
  // unmounted outright while inactive, rather than merely declining to
  // become the touch responder.
  const swipeAimEnabled =
    connectState === 'connected' &&
    swipeAimSensitivityRaw > 0 &&
    activeSwipeRect.show !== false &&
    swipeAimActive;
  const swipeAimRect = {
    x: activeSwipeRect.x,
    y: activeSwipeRect.y,
    width: activeSwipeRect.width ?? 300,
    height: activeSwipeRect.height ?? 260,
  };

  return {
    t,
    title: params.name ?? '',
    connectState,
    progressText,
    errorDetail,
    pinRequest,
    pin,
    onChangePin: setPin,
    onSubmitPin,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
    onStickMove: handleStickMove,
    onRequestExit: requestExit,
    activeProfile,
    joystickMode,
    showControlRail,
    onOpenControlRail: openControlRail,
    onCloseControlRail: closeControlRail,
    vibrationEnabled,
    onToggleVibration,
    performanceVisible,
    onTogglePerformance,
    metrics,
    screenPosition,
    onSetScreenPosition,
    videoFormat,
    onCycleVideoFormat,
    audioGain,
    onAudioGainChange,
    onEditGamepadLayout,
    showGamepadEditor,
    editorProfile,
    gamepadProfiles,
    editorSwipeConfig,
    editorSensorConfig,
    onSaveGamepadLayout,
    onCancelGamepadEditor,
    onSwitchGamepadProfile,
    onCreateGamepadProfile,
    onDeleteGamepadProfile,
    gamepadLayoutVersion,
    swipeAimEnabled,
    swipeAimSensitivity: swipeAimSensitivityRaw * 0.0025,
    swipeAimAcceleration: swipeAimAccelerationRaw * 0.0003,
    swipeAimRect,
    onSwipeAim: handleSwipeAim,
    onSwipeAimEnd: clearSwipeAim,
    swipeAimIsActive: isSwipeAimActive,
    coverAvailable,
    coverPresented,
    onToggleCoverControls,
    onRailDisconnect,
  };
}

export type PsPlusStreamViewModel = ReturnType<typeof usePsPlusStream>;
