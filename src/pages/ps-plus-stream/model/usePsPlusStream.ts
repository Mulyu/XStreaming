import React from 'react';
import {
  Alert,
  AppState,
  DeviceEventEmitter,
  Dimensions,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import BackgroundTimer from 'react-native-background-timer';
import {useTranslation} from 'react-i18next';
import {
  PsPlusSession,
  PsPlusConnectionState,
  StreamMetrics,
  getNpsso,
  createTouchpadClickTracker,
} from '../../../features/ps-plus-session';
import type {TouchpadTouch} from '../../../features/ps-plus-session';
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
  getLastProfileForGame,
  setLastProfileForGame,
} from '../../../features/controller-customization';
import type {
  ButtonConfig,
  SensorConfig,
  SwipeConfig,
} from '../../../features/controller-customization';
import {
  getSettings,
  getSettingsCached,
  saveSettings,
} from '../../../shared/lib/settings';
import {
  createGamepadMapper,
  getInputBindings,
  usePhysicalInput,
} from '../../../features/physical-input';
import {debugFactory} from '../../../shared/lib/debug';
import type {LoadingPhase} from '../../../shared/lib/loadingPhase';

const {
  FullScreenManager,
  GamepadManager,
  CoverDisplayManager,
  StreamKeepAliveManager,
} = NativeModules;

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

// button name -> keyCode: the user's saved custom mapping (shared across
// every streaming provider, including this one) if they set one, else the
// stock Android gamepad key-code mapping.
const buildGamepadMapping = (): Record<string, number> => {
  const custom = getSettings().native_gamepad_maping;
  // Merge rather than replace outright -- a custom mapping saved before a
  // new default button (e.g. Touchpad) existed would otherwise silently
  // lose that button forever, since it has no key for it at all and this
  // screen's own remap UI doesn't offer every GAMEPAD_MAPING entry (see
  // native-game-map's fixed buttonLabels list).
  return custom && Object.keys(custom).length > 0
    ? {...GAMEPAD_MAPING, ...custom}
    : GAMEPAD_MAPING;
};

// keyCode -> button name, same convention native-stream's own gpMaping uses.
const buildKeyMap = (): Record<number, string> => {
  const source = buildGamepadMapping();
  const map: Record<number, string> = {};
  for (const [name, code] of Object.entries(source)) {
    map[code as number] = name;
  }
  return map;
};

const normaliseAxis = (value: number): number => {
  const deadZone = getSettingsCached().dead_zone;
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

// Raw swipe-aim sensitivity/acceleration settings -> the per-pixel factors
// SwipeAimZone expects.
const SWIPE_AIM_SENSITIVITY_SCALE = 0.0025;
const SWIPE_AIM_ACCELERATION_SCALE = 0.0003;
// Mouse aim when the profile has no swipe-aim sensitivity (0 = off for the
// touch trackpad, but a mouse still needs to aim).
const PHYSICAL_MOUSE_SENSITIVITY = 20;

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
  // auto-select step reporting every datacenter ping failed outright
  // ("PING_TIMEOUT:UNREACHABLE"). The RTT quality gate that used to also
  // report here ("PING_TIMEOUT:<rtt>ms" for a best measured RTT over 80ms)
  // was removed -- auto-select now always takes the lowest-RTT datacenter
  // that actually responded -- but the numeric-RTT branch below is kept for
  // compatibility with an older native build.
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
  Touchpad: 0,
  LeftTrigger: 0,
  RightTrigger: 0,
  LeftThumbXAxis: 0,
  LeftThumbYAxis: 0,
  RightThumbXAxis: 0,
  RightThumbYAxis: 0,
  // Touchpad fingers, [{id, x, y}] with x/y 0..1 across the pad.
  Touches: [] as {id: number; x: number; y: number}[],
});

export function usePsPlusStream(navigation: any, route: any) {
  const {t} = useTranslation();
  const params = route.params ?? {};
  const [connectState, setConnectState] =
    React.useState<PsPlusConnectionState>('connecting');
  const [progressText, setProgressText] = React.useState('');
  // Drives StreamHandshakeOverlay's phase ladder, same as native-stream's
  // own loadingPhase -- see PsPlusSession.connect's mapProvisionStageToPhase
  // for how the native provisioning stage strings map onto this.
  const [loadingPhase, setLoadingPhase] =
    React.useState<LoadingPhase>('handshake');
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

  // Whether the on-screen virtual gamepad overlay is shown -- mirrors native-
  // stream's own showVirtualGamepad concept, but (unlike native-stream, which
  // only toggles this manually) also auto-follows physical-controller
  // presence: see the GamepadManager.hasPhysicalController()/
  // onGamepadConnectionChanged effect below. PS Plus has no touch/mouse input
  // mode to fall back on (it's gamepad-only, see PsPlusControlRail.tsx), so
  // hiding this just means "trust the physical controller that's plugged in."
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(true);
  const onToggleVirtualGamepad = React.useCallback(
    () => setShowVirtualGamepad(prev => !prev),
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

  // The stable per-title key the last-used-profile memory is stored under
  // (the same per-game memory native-stream keeps for xCloud/GFN, in the same
  // store). Prefixed so a PS Plus product id can never collide with an
  // xCloud session id or GFN app id.
  const profileGameId = params.productId
    ? `psplus:${params.productId}`
    : params.streamIdentifier
    ? `psplus:${params.streamIdentifier}`
    : '';

  // Switch (or newly select) the live/active layout; '' selects the built-in
  // Default. Mirrors native-stream's own applyActiveProfile.
  const applyActiveProfile = React.useCallback(
    (name: string) => {
      saveSettings({...getSettings(), custom_virtual_gamepad: name});
      setActiveProfile(name);
      setEditorProfile(name);
      setGamepadLayoutVersion(v => v + 1);
      // Cover buttons follow the active touch-controller profile too.
      coverGamepadBus.setLayout(getCoverLayout(name || ''));
      // Remember it as this game's profile so the next launch restores it.
      setLastProfileForGame(profileGameId, name);
    },
    [profileGameId],
  );

  // On launch, switch to the touch-controller profile last used for this game.
  // Declared before the cover-screen effect further down so that effect reads
  // the restored profile out of settings.
  const profileRestoredRef = React.useRef(false);
  React.useEffect(() => {
    if (profileRestoredRef.current) {
      return;
    }
    profileRestoredRef.current = true;
    if (!profileGameId) {
      return;
    }
    const last = getLastProfileForGame(profileGameId);
    if (last === null) {
      return;
    }
    // '' (Default) is always valid; a named profile must still exist.
    if (last !== '' && !getGamepadLayouts()[last]) {
      return;
    }
    const current = getSettings();
    if ((current.custom_virtual_gamepad || '') === last) {
      return;
    }
    saveSettings({...current, custom_virtual_gamepad: last});
    setActiveProfile(last);
    setGamepadLayoutVersion(v => v + 1);
    coverGamepadBus.setLayout(getCoverLayout(last));
  }, [profileGameId]);

  const onSwitchGamepadProfile = React.useCallback(
    (name: string) => applyActiveProfile(name),
    [applyActiveProfile],
  );

  // Once connected, remember whatever profile is active for this game, so a
  // game the user never re-profiles still restores its current layout.
  React.useEffect(() => {
    if (connectState !== 'connected' || !profileGameId) {
      return;
    }
    setLastProfileForGame(
      profileGameId,
      getSettings().custom_virtual_gamepad || '',
    );
  }, [connectState, profileGameId]);

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
      setLastProfileForGame(
        profileGameId,
        getSettings().custom_virtual_gamepad || '',
      );
    },
    [editorProfile, activeProfile, profileGameId],
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
    // A TV's display is physically fixed landscape -- locking orientation
    // doesn't rotate anything there, it just tells Android this Activity
    // "wants" a specific aspect ratio, which some Android TV/Google TV
    // launchers honor by letterboxing the app into a small portrait-shaped
    // window inside the TV screen on the way back out (see native-stream's
    // own identical fix). Skip the lock/re-lock dance entirely on TV.
    if (!Platform.isTV) {
      Orientation.lockToLandscape();
    }
    return () => {
      if (!Platform.isTV) {
        Orientation.lockToPortrait();
      }
      FullScreenManager.immersiveModeOff();
    };
  }, []);

  const sessionRef = React.useRef<PsPlusSession | null>(null);
  const gpState = React.useRef(createGpState());
  // Auto-fire (turbo): button names with turbo in the active profile, and
  // their running repeat timers -- mirrors native-stream's own
  // turboSetRef/turboTimersRef (see its handleButtonPressIn/Out), which this
  // screen never had despite sharing the exact same per-profile ButtonConfig.
  const turboSetRef = React.useRef<Set<string>>(new Set());
  const turboTimersRef = React.useRef<Record<string, any>>({});
  // Toggle-hold: button names with holdToggle in the active profile.
  const holdToggleSetRef = React.useRef<Set<string>>(new Set());

  // Background keep-alive notification -- mirrors native-stream's own
  // StreamKeepAliveManager wiring verbatim (same native service/notification,
  // same i18n keys) so backgrounding mid-game survives (foreground service +
  // an ongoing "tap to return" notification with a Disconnect action)
  // instead of the session silently dying, and backgrounding during the
  // initial connect still lets the player know once it's ready.
  const currentAppStateRef = React.useRef(AppState.currentState);
  const backgroundMutedRef = React.useRef(false);
  // Unlike xCloud's own anti-idle (a repeating camera nudge that spoofs
  // activity against xCloud's *server-side* AFK timer, see native-stream's
  // own AppState effect), chiaki's cloud session has no server-side AFK
  // disconnect to spoof around at all -- nothing here ever times the
  // session out on its own while backgrounded. So the same
  // anti_idle_max_minutes setting is honored for PS Plus as a single
  // explicit client-initiated disconnect once that many minutes of
  // backgrounding elapse, rather than a repeating nudge.
  const antiIdleTimerRef = React.useRef<number | null>(null);
  const hasConnectedRef = React.useRef(false);
  const batteryOptPromptRef = React.useRef(false);
  const audioGainRef = React.useRef(getSettings().audio_gain ?? 1);

  const flushGpState = React.useCallback(() => {
    sessionRef.current?.setGamepadState(gpState.current);
  }, []);

  // The touchpad: an on-screen pad (toggled from the control rail) whose
  // fingers go out as the PS touchpad's touches, and whose press-and-hold is
  // the touchpad click. Fingers and click live in gpState like everything
  // else, so the 16 ms input loop sends them with the sticks and buttons.
  const [touchpadVisible, setTouchpadVisible] = React.useState(false);
  const touchpadClickTracker = React.useMemo(
    () =>
      createTouchpadClickTracker(down => {
        gpState.current.Touchpad = down ? 1 : 0;
        flushGpState();
      }),
    [flushGpState],
  );
  const onTouchpadChange = React.useCallback(
    (touches: TouchpadTouch[]) => {
      gpState.current.Touches = touches;
      touchpadClickTracker.update(touches);
      flushGpState();
    },
    [flushGpState, touchpadClickTracker],
  );
  const touchpadShown =
    touchpadVisible && connectState === 'connected' && !showControlRail;
  // Whenever the pad goes away (closed, rail opened, stream ended) lift every
  // finger and the click -- the native view can't report fingers that were
  // still down when it unmounted.
  React.useEffect(() => {
    if (touchpadShown) {
      return undefined;
    }
    touchpadClickTracker.reset();
    if (gpState.current.Touches.length > 0 || gpState.current.Touchpad) {
      gpState.current.Touches = [];
      gpState.current.Touchpad = 0;
      flushGpState();
    }
    return undefined;
  }, [touchpadShown, touchpadClickTracker, flushGpState]);
  // Opening the pad also closes the rail it was toggled from, so it is
  // usable straight away.
  const onToggleTouchpad = React.useCallback(() => {
    setTouchpadVisible(prev => !prev);
    setShowControlRail(false);
  }, []);
  const onCloseTouchpad = React.useCallback(
    () => setTouchpadVisible(false),
    [],
  );

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

  // Rebuild the set of turbo/hold-toggle button names for the active profile
  // -- same rebuild native-stream's own effect does for its own refs.
  React.useEffect(() => {
    const layout = activeProfile ? getGamepadLayouts()[activeProfile] : null;
    const set = new Set<string>();
    const holdSet = new Set<string>();
    if (Array.isArray(layout)) {
      layout.forEach((b: ButtonConfig) => {
        if (b?.turbo) {
          set.add(b.name);
        }
        if (b?.holdToggle) {
          holdSet.add(b.name);
        }
      });
    }
    turboSetRef.current = set;
    holdToggleSetRef.current = holdSet;
  }, [activeProfile, gamepadLayoutVersion]);

  // Clear any running turbo timers when leaving the stream screen.
  React.useEffect(() => {
    const timers = turboTimersRef.current;
    return () => {
      Object.keys(timers).forEach(n => clearInterval(timers[n]));
    };
  }, []);

  // Whether swipe-aim should actually claim/apply a touch right now, per its
  // activation scheme (same scheme as gyro-aim's SensorConfig.activation):
  // always, or only while the configured trigger/bumper is held. Read live
  // off gpState -- not memoized -- so the per-move output gate further
  // below, the swipeAimActive React state synced to it, and SwipeAimZone's
  // own isActive prop all agree with the current button state.
  const isSwipeAimActive = React.useCallback(() => {
    const activation = activeSwipe.activation;
    const deadZone = getSettingsCached().dead_zone || 0;
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

  // Writes a right-stick (camera) velocity and arms the recentre timer. Not
  // gated on the swipe-aim activation scheme -- handleSwipeAim adds that for
  // touch, a physical mouse always aims.
  const applyAim = React.useCallback(
    (dx: number, dy: number) => {
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
    [activeSwipe.invertY, flushGpState, clearSwipeAim],
  );

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
      applyAim(dx, dy);
    },
    [isSwipeAimActive, applyAim],
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
    audioGainRef.current = audioGain;
  }, [audioGain]);

  React.useEffect(() => {
    const npsso = getNpsso();
    if (!npsso) {
      setConnectState('failed');
      setErrorDetail('Not signed in');
      return;
    }
    const title = params.name ?? '';
    const session = new PsPlusSession({
      onState: (state, detail) => {
        setConnectState(state);
        if (detail) {
          setErrorDetail(friendlyStreamError(detail, t));
        }
        if (state === 'closed' || state === 'failed') {
          StreamKeepAliveManager?.stop?.();
          return;
        }
        if (state !== 'connected' || hasConnectedRef.current) {
          return;
        }
        hasConnectedRef.current = true;
        // Drop the connecting-phase keep-alive started below -- the
        // in-stream one needs a clean slate to arm() onto.
        StreamKeepAliveManager?.stop?.();
        // If the user backgrounded the app while this was still connecting,
        // let them know it's ready, same as native-stream's own
        // StreamReadyNotifyBody notification.
        if (currentAppStateRef.current !== 'active') {
          StreamKeepAliveManager?.notifyReady?.(
            String(title || t('Connecting...')),
            t('StreamReadyNotifyBody'),
          );
        }
        // Get the keep-alive service running now, while definitely still in
        // the foreground, so a later backgrounding can reliably promote it
        // to show the notification.
        StreamKeepAliveManager?.arm?.();
        if (
          Platform.OS === 'android' &&
          typeof Platform.Version === 'number' &&
          Platform.Version >= 33
        ) {
          PermissionsAndroid.request(
            'android.permission.POST_NOTIFICATIONS' as any,
          ).catch(() => {});
        }
        // Many OEMs suspend background execution within a few minutes and
        // cut the stream even with a foreground service; offer to whitelist
        // the app from battery optimization (once per session, only if
        // needed) -- same prompt native-stream's own connect handler shows.
        // Google TV boxes are mains-powered and don't carry this OEM
        // battery-management UI, so there's nothing useful for this prompt
        // to send the user to there.
        if (!Platform.isTV && !batteryOptPromptRef.current) {
          batteryOptPromptRef.current = true;
          StreamKeepAliveManager?.isIgnoringBatteryOptimizations?.()
            .then((ignoring: boolean) => {
              if (!ignoring) {
                Alert.alert(t('Warning'), t('BatteryOptimizationPrompt'), [
                  {text: t('Cancel'), style: 'cancel'},
                  {
                    text: t('Confirm'),
                    style: 'default',
                    onPress: () => {
                      StreamKeepAliveManager?.requestDisableBatteryOptimization?.();
                    },
                  },
                ]);
              }
            })
            .catch(() => {});
        }
      },
      onProgress: (text, phase) => {
        setProgressText(text);
        setLoadingPhase(phase);
      },
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
    // Survives backgrounding during the connect/handshake wait itself (a PS5
    // cloud session can take a while to provision) -- started here, while
    // definitely still foreground, so a later background can reliably
    // promote/notify; stopped once connected (or on failure/close) above.
    StreamKeepAliveManager?.start?.(
      String(title || t('Connecting...')),
      t('Connecting...'),
      t('Disconnect'),
      0,
    );
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
      StreamKeepAliveManager?.stop?.();
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

  // Auto-fire: while held, rapidly toggle the button so it repeats -- same
  // 60ms on/off cadence as native-stream's own startTurbo/stopTurbo.
  const startTurbo = React.useCallback(
    (name: string) => {
      if (turboTimersRef.current[name]) {
        return;
      }
      let on = true;
      (gpState.current as any)[name] = 1;
      flushGpState();
      turboTimersRef.current[name] = setInterval(() => {
        on = !on;
        (gpState.current as any)[name] = on ? 1 : 0;
        flushGpState();
      }, 60);
    },
    [flushGpState],
  );

  const stopTurbo = React.useCallback(
    (name: string) => {
      const timer = turboTimersRef.current[name];
      if (timer) {
        clearInterval(timer);
        delete turboTimersRef.current[name];
      }
      (gpState.current as any)[name] = 0;
      flushGpState();
    },
    [flushGpState],
  );

  const handlePressIn = React.useCallback(
    (name: string) => {
      if (turboSetRef.current.has(name)) {
        startTurbo(name);
        return;
      }

      if (holdToggleSetRef.current.has(name)) {
        (gpState.current as any)[name] =
          (gpState.current as any)[name] === 1 ? 0 : 1;
        flushGpState();
        if (name === 'LeftTrigger' || name === 'LeftShoulder') {
          setSwipeAimActive(isSwipeAimActive());
        }
        return;
      }

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
    [flushGpState, openControlRail, isSwipeAimActive, startTurbo],
  );

  const handlePressOut = React.useCallback(
    (name: string) => {
      if (turboTimersRef.current[name]) {
        stopTurbo(name);
        return;
      }

      if (holdToggleSetRef.current.has(name)) {
        return;
      }

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
    [flushGpState, isSwipeAimActive, stopTurbo],
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

  // Physical keyboard + mouse (USB/Bluetooth, incl. Samsung DeX): the PS Plus
  // protocol has no keyboard/mouse channel, so both are translated onto the
  // same gamepad state the on-screen controls drive. Mouse motion becomes
  // right-stick aim using the active profile's swipe-aim tuning.
  // Handlers go through a ref so the mapper (and the keys it is holding)
  // survives handler identity changes.
  const physicalSinkRef = React.useRef({
    press: handlePressIn,
    release: handlePressOut,
    stick: handleStickMove,
  });
  physicalSinkRef.current = {
    press: handlePressIn,
    release: handlePressOut,
    stick: handleStickMove,
  };
  const physicalMapper = React.useMemo(
    () =>
      createGamepadMapper(
        {
          press: name => physicalSinkRef.current.press(name),
          release: name => physicalSinkRef.current.release(name),
          moveLeftStick: (x, y) =>
            physicalSinkRef.current.stick('left', {x, y}),
        },
        getInputBindings(),
      ),
    [],
  );
  const physicalEnabled = connectState === 'connected';
  React.useEffect(() => {
    if (!physicalEnabled) {
      return undefined;
    }
    return () => physicalMapper.releaseAll();
  }, [physicalEnabled, physicalMapper]);
  const handlePhysicalMouseMove = React.useCallback(
    (dx: number, dy: number) => {
      const sensitivity =
        (Number(activeSwipe.sensitivity) || PHYSICAL_MOUSE_SENSITIVITY) *
        SWIPE_AIM_SENSITIVITY_SCALE;
      const acceleration =
        (Number(activeSwipe.acceleration) || 0) * SWIPE_AIM_ACCELERATION_SCALE;
      const boost =
        acceleration > 0 ? 1 + acceleration * Math.hypot(dx, dy) : 1;
      applyAim(dx * sensitivity * boost, dy * sensitivity * boost);
    },
    [activeSwipe.sensitivity, activeSwipe.acceleration, applyAim],
  );
  usePhysicalInput(physicalEnabled, {
    onKey: e => physicalMapper.key(e.keyCode, e.down),
    onMouseMove: handlePhysicalMouseMove,
    onMouseButton: physicalMapper.mouseButton,
    onMouseWheel: physicalMapper.wheel,
    onMenu: openControlRail,
  });

  // Physical controller (USB/Bluetooth) support, mirroring native-stream's
  // own "normal mode" gamepad wiring (not its separate USB-DualSense-native
  // path, which needs its own low-level rumble/adaptive-trigger protocol --
  // out of scope here) but simplified to one controller/one gpState, since
  // PS Plus has no local-coop/split-screen concept. Feeds the exact same
  // gpState ref and flushGpState the on-screen VirtualGamepad already uses,
  // so both input sources compose for free.
  React.useEffect(() => {
    const keyMap = buildKeyMap();
    const gamepadMapping = buildGamepadMapping();
    const eventEmitter = new NativeEventEmitter();

    const applyDpad = (pressedKeys: number[]) => {
      // Was reading getSettings().native_gamepad_maping directly here,
      // which (unlike buildGamepadMapping()/buildKeyMap() above) has no
      // GAMEPAD_MAPING fallback -- for any user who never visited the
      // remap screen (native_gamepad_maping unset), every direction's code
      // was undefined and this silently never touched gpState at all. A
      // Bluetooth controller reporting D-pad via hat-axis motion (this
      // path) rather than discrete key events (onGamepadKeyDown below,
      // unaffected -- it already goes through keyMap) would see that
      // direction simply never respond.
      const active = new Set(pressedKeys ?? []);
      (['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'] as const).forEach(
        direction => {
          const code = gamepadMapping[direction];
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

  // Auto-switch away from the virtual gamepad overlay when a physical
  // controller is connected (and back when it disconnects), same as the
  // user picking up a controller should "just work" without hunting for a
  // settings toggle first. onGamepadConnectionChanged (emitted from
  // ControllerHandler.java) only fires on a *change*, so hasPhysicalController()
  // covers the case where a controller was already attached before this
  // screen mounted.
  React.useEffect(() => {
    let cancelled = false;
    GamepadManager.hasPhysicalController()
      .then((connected: boolean) => {
        if (!cancelled && connected) {
          setShowVirtualGamepad(false);
        }
      })
      .catch(() => {});

    const eventEmitter = new NativeEventEmitter();
    const sub = eventEmitter.addListener(
      'onGamepadConnectionChanged',
      event => {
        setShowVirtualGamepad(!event?.connected);
      },
    );

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

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

  // The background keep-alive notification's "Disconnect" action -- the
  // player already made the decision by tapping it, so this exits directly
  // with no confirmation dialog, same as native-stream's own
  // StreamKeepAliveDisconnect handler.
  const forceExit = React.useCallback(() => {
    exitConfirmedRef.current = true;
    navigation.goBack();
  }, [navigation]);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'StreamKeepAliveDisconnect',
      forceExit,
    );
    return () => sub.remove();
  }, [forceExit]);

  const clearAntiIdleTimer = React.useCallback(() => {
    if (antiIdleTimerRef.current != null) {
      BackgroundTimer.clearTimeout(antiIdleTimerRef.current);
      antiIdleTimerRef.current = null;
    }
  }, []);

  // Background keep-alive: while backgrounded mid-game, mute the game audio
  // (independent of the Android system volume -- the session keeps running
  // via the native foreground service) and promote the keep-alive
  // notification from "armed" to visible/ongoing; on return to the
  // foreground, hide it again (demote, not stop, so the next backgrounding
  // can promote it reliably) and restore audio. Exactly native-stream's own
  // AppState effect, except its anti-idle setting is enforced as a single
  // explicit disconnect deadline instead of a repeating camera nudge (see
  // antiIdleTimerRef's own comment for why).
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      currentAppStateRef.current = state;
      if (state === 'active') {
        if (hasConnectedRef.current) {
          StreamKeepAliveManager?.demote?.();
        }
        clearAntiIdleTimer();
        if (backgroundMutedRef.current) {
          backgroundMutedRef.current = false;
          sessionRef.current?.setAudioGain(audioGainRef.current);
        }
        return;
      }
      if (state !== 'background' || connectStateRef.current !== 'connected') {
        return;
      }
      if (getSettings().background_mute !== false) {
        backgroundMutedRef.current = true;
        sessionRef.current?.setAudioGain(0);
      }
      // Anti-idle is controlled solely by the max-duration slider: 0 = off.
      // Same setting/semantics as native-stream's own, just enforced here as
      // a single disconnect deadline (see antiIdleTimerRef's comment).
      const antiIdleMinutes = Number(getSettings().anti_idle_max_minutes) || 0;
      const antiIdleDeadline =
        antiIdleMinutes > 0 ? Date.now() + antiIdleMinutes * 60 * 1000 : 0;
      // promote() (not start()) -- the service was already armed while
      // connected, and Android may otherwise refuse to start a brand new
      // foreground service now that the app has already left the
      // foreground.
      StreamKeepAliveManager?.promote?.(
        t('Streaming in background'),
        antiIdleDeadline > 0
          ? t('BackgroundKeepAliveAntiIdle')
          : t('BackgroundKeepAliveNotification'),
        t('Disconnect'),
        antiIdleDeadline,
      );
      if (antiIdleDeadline > 0) {
        clearAntiIdleTimer();
        antiIdleTimerRef.current = BackgroundTimer.setTimeout(() => {
          antiIdleTimerRef.current = null;
          forceExit();
        }, antiIdleMinutes * 60 * 1000);
      }
    });
    return () => subscription.remove();
  }, [t, forceExit, clearAntiIdleTimer]);

  // Clears the pending auto-disconnect if the hook unmounts while
  // backgrounded (e.g. the session ended some other way first) -- otherwise
  // BackgroundTimer would still fire forceExit on an already-torn-down
  // session.
  React.useEffect(() => clearAntiIdleTimer, [clearAntiIdleTimer]);

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

  // Back opens the control rail instead of exiting -- the quickMenu button
  // that used to open it is gone, this is the only way in now, same as
  // native-stream's own identical change. Its own Disconnect button is the
  // actual way to leave from here.
  React.useEffect(() => {
    const beforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (exitConfirmedRef.current) {
        return;
      }
      if (e.data.action.type === 'GO_BACK' && connectState === 'connected') {
        e.preventDefault();
        openControlRail();
      }
    });
    return beforeRemove;
  }, [navigation, connectState, openControlRail]);

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
    posterUrl: typeof params.posterUrl === 'string' ? params.posterUrl : '',
    connectState,
    progressText,
    loadingPhase,
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
    showVirtualGamepad,
    onToggleVirtualGamepad,
    touchpadVisible: touchpadShown,
    onTouchpadChange,
    onToggleTouchpad,
    onCloseTouchpad,
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
    swipeAimSensitivity: swipeAimSensitivityRaw * SWIPE_AIM_SENSITIVITY_SCALE,
    swipeAimAcceleration:
      swipeAimAccelerationRaw * SWIPE_AIM_ACCELERATION_SCALE,
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
