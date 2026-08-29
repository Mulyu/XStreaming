import React from 'react';
import {
  View,
  Image,
  Alert,
  NativeModules,
  NativeEventEmitter,
  StyleSheet,
  ToastAndroid,
  Platform,
  PermissionsAndroid,
  Vibration,
  AppState,
  DeviceEventEmitter,
  StatusBar,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import {IconButton} from 'react-native-paper';
import {RTCView, MediaStream, RTCRtpReceiver} from 'react-native-webrtc';
import Orientation from 'react-native-orientation-locker';
import Spinner from '../components/Spinner';
import {useSelector} from 'react-redux';
import XcloudApi from '../xCloud';
import WebApi from '../web';
import {getSettings, saveSettings} from '../store/settingStore';
import {
  saveSettings as saveGamepadLayout,
  getSettings as getGamepadLayouts,
  deleteSetting as deleteGamepadProfile,
} from '../store/gamepadStore';
import {
  buildDefaultLayout,
  SWIPE_AIM_NAME,
  createDefaultSwipePad,
} from '../utils/gamepadLayout';
import {
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
  getCoverEnabled,
  getLastProfileForGame,
  setLastProfileForGame,
} from '../store/touchProfileStore';
import {useTranslation} from 'react-i18next';
import webRTCClient from '../webrtc';
import BackgroundTimer from 'react-native-background-timer';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import {XBOX_360_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import VirtualGamepadEditor, {
  ButtonConfig,
} from '../components/VirtualGamepadEditor';
import PerfPanel from '../components/PerfPanel';
import RTCFsrView from '../components/RTCFsrView';
import NativeTouchOverlay from '../components/NativeTouchOverlay';
import SwipeAimZone from '../components/SwipeAimZone';
import {coverGamepadBus} from '../utils/coverGamepadBus';
import {getCoverLayout} from '../store/coverLayoutStore';
import PortraitVirtualGamepad, {
  PortraitGamepadControl,
} from '../components/PortraitVirtualGamepad';
import type {PointerWireData} from '../webrtc/Channel/Input';
import {
  normalizeMacroLoopIntervalMs,
  normalizeMacroSteps,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  VIRTUAL_MACRO_BUTTON_NAME,
  DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
} from '../utils/virtualMacro';

const log = debugFactory('NativeStreamScreen');

const CONNECTED = 'connected';
const CLOSED = 'closed';
const FAILED = 'failed';
const DUALSENSE = 'DualSenseController';
const LIVE_GAMEPAD_PROFILE = 'LiveLayout';
const {
  FullScreenManager,
  GamepadManager,
  SdlGamepadManager,
  UsbRumbleManager,
  SensorModule,
  GamepadSensorModule,
  StreamKeepAliveManager,
  NativeInputDialog,
  CoverDisplayManager,
} = NativeModules;

let defaultMaping: any = GAMEPAD_MAPING;
let triggerMax = 0.8;

const GAMEPAD_DIGITAL_KEYS = [
  'A',
  'B',
  'X',
  'Y',
  'LeftShoulder',
  'RightShoulder',
  'View',
  'Menu',
  'LeftThumb',
  'RightThumb',
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
  'Nexus',
];

const SYSTEM_UI_TARGET_SHOW_MESSAGE_DIALOG =
  '/streaming/systemUi/messages/ShowMessageDialog';
const SYSTEM_UI_TARGET_SHOW_VIRTUAL_KEYBOARD =
  '/streaming/systemUi/messages/ShowVirtualKeyboard';
const STREAMING_TOUCHCONTROLS_SCOPE = '/streaming/touchcontrols';
const STOP_STREAM_TIMEOUT_MS = 5000;
const PROCESSED_FRAME_FEEDBACK_DECODE_MS = 10;

const getFrameFeedbackNowMs = () => {
  return globalThis.performance?.now?.() ?? Date.now();
};

const createStableResolutionProcessedFrame = () => {
  const decodedTimeMs = getFrameFeedbackNowMs();
  const submittedTimeMs = decodedTimeMs - PROCESSED_FRAME_FEEDBACK_DECODE_MS;
  return {
    serverDataKey: Date.now(),
    firstFramePacketArrivalTimeMs: submittedTimeMs,
    frameSubmittedTimeMs: submittedTimeMs,
    frameDecodedTimeMs: decodedTimeMs,
    frameRenderedTimeMs: decodedTimeMs,
    expectedDisplayTime: decodedTimeMs + 1,
  };
};

const stopStreamWithTimeout = (streamApi: any) => {
  if (!streamApi || typeof streamApi.stopStream !== 'function') {
    return Promise.resolve();
  }

  let timeoutId: any;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('STOP_STREAM_TIMEOUT'));
    }, STOP_STREAM_TIMEOUT_MS);
  });

  return Promise.race([
    Promise.resolve().then(() => streamApi.stopStream()),
    timeoutPromise,
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

const createGamepadState = (gamepadIndex = 0) => ({
  GamepadIndex: gamepadIndex,
  A: 0,
  B: 0,
  X: 0,
  Y: 0,
  LeftShoulder: 0,
  RightShoulder: 0,
  LeftTrigger: 0,
  RightTrigger: 0,
  View: 0,
  Menu: 0,
  LeftThumb: 0,
  RightThumb: 0,
  DPadUp: 0,
  DPadDown: 0,
  DPadLeft: 0,
  DPadRight: 0,
  Nexus: 0,
  LeftThumbXAxis: 0.0,
  LeftThumbYAxis: 0.0,
  RightThumbXAxis: 0.0,
  RightThumbYAxis: 0.0,
});

const resetGamepadState = (
  state: any,
  gamepadIndex = state.GamepadIndex ?? 0,
) => {
  state.GamepadIndex = gamepadIndex;
  state.A = 0;
  state.B = 0;
  state.X = 0;
  state.Y = 0;
  state.LeftShoulder = 0;
  state.RightShoulder = 0;
  state.LeftTrigger = 0;
  state.RightTrigger = 0;
  state.View = 0;
  state.Menu = 0;
  state.LeftThumb = 0;
  state.RightThumb = 0;
  state.DPadUp = 0;
  state.DPadDown = 0;
  state.DPadLeft = 0;
  state.DPadRight = 0;
  state.Nexus = 0;
  state.LeftThumbXAxis = 0.0;
  state.LeftThumbYAxis = 0.0;
  state.RightThumbXAxis = 0.0;
  state.RightThumbYAxis = 0.0;
};

const gpState = createGamepadState(0);

type NativeStreamScreenProps = {
  navigation: any;
  route: any;
  portraitMode?: boolean;
};

export function NativeStreamScreenBase({
  navigation,
  route,
  portraitMode = false,
}: NativeStreamScreenProps) {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);

  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [streamApi, setStreamApi] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [coverAvailable, setCoverAvailable] = React.useState(false);
  const [coverPresented, setCoverPresented] = React.useState(false);
  const coverPressInRef = React.useRef<(name: string) => void>(() => {});
  const coverPressOutRef = React.useRef<(name: string) => void>(() => {});
  // True while the user has explicitly hidden the cover controls this session,
  // so we don't auto-present again until they re-enable or the device re-opens.
  const coverHiddenRef = React.useRef(false);
  // Auto-fire (turbo): button names with turbo in the active profile, and their
  // running repeat timers.
  const turboSetRef = React.useRef<Set<string>>(new Set());
  const turboTimersRef = React.useRef<Record<string, any>>({});
  const [performance, setPerformance] = React.useState<any>({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [messageSending, setMessageSending] = React.useState(false);
  const [showGamepadEditor, setShowGamepadEditor] = React.useState(false);
  const [editorProfile, setEditorProfile] = React.useState('');
  const [gamepadProfiles, setGamepadProfiles] = React.useState<string[]>([]);
  const [gamepadLayoutVersion, setGamepadLayoutVersion] = React.useState(0);
  const [swipeConfigVersion, setSwipeConfigVersion] = React.useState(0);
  const [audioGain, setAudioGain] = React.useState(1);
  const [portraitGamepadEditing, setPortraitGamepadEditing] =
    React.useState(false);
  const [openMicro, setOpenMicro] = React.useState(false);
  // Picture-in-picture was removed; keep the flag as a constant so the many
  // render conditions that referenced it stay valid.
  const isInPictureInPicture = false;
  const xHomeApiRef = React.useRef<any>(undefined);
  const xCloudApiRef = React.useRef<any>(undefined);
  const isRumbling = React.useRef(false);
  const systemKeyboardTransactionRef = React.useRef<any>(null);
  const handleExitRef = React.useRef<(off?: boolean) => void | Promise<void>>(
    () => {},
  );

  // webrtc
  const [webrtcClient, setWebrtcClient] = React.useState<any>(undefined);
  const [remote, setRemote] = React.useState<any>(null);
  const remoteStream = React.useRef<any>(null);
  const audioGainRef = React.useRef(1);
  const keepaliveInterval = React.useRef<any>(null);
  const performanceInterval = React.useRef<any>(null);
  const connectStateRef = React.useRef<any>('');

  const gpDownEventListener = React.useRef<any>(undefined);
  const gpUpEventListener = React.useRef<any>(undefined);
  const dpDownEventListener = React.useRef<any>(undefined);
  const dpUpEventListener = React.useRef<any>(undefined);
  const stickEventListener = React.useRef<any>(undefined);
  const triggerEventListener = React.useRef<any>(undefined);
  const isRightstickMoving = React.useRef(false);
  const timer = React.useRef<any>(undefined);
  const menuLongPressTimer = React.useRef<any>(undefined);
  const menuLongPressTriggered = React.useRef(false);
  const frameTimer = React.useRef<any>(undefined);
  const audioRumbleTimer = React.useRef<any>(undefined);
  const appStateSubscription = React.useRef<any>(undefined);
  const audioGainEventListener = React.useRef<any>(undefined);
  const antiIdleTimerRef = React.useRef<any>(null);
  const antiIdleResetTimerRef = React.useRef<any>(null);
  const antiIdleDeadlineRef = React.useRef<number>(0);
  const keepAliveDisconnectListener = React.useRef<any>(undefined);
  const batteryOptPromptRef = React.useRef(false);
  const isRequestExit = React.useRef(false);
  const isConnected = React.useRef(false);
  const optionsDialogOpenRef = React.useRef(false);
  const macroSequenceTimersRef = React.useRef<any[]>([]);
  const activeMacroButtonsRef = React.useRef<Set<string>>(new Set());
  const activeMacroSticksRef = React.useRef<Set<string>>(new Set());
  const isMacroLoopRunningRef = React.useRef(false);
  const manualLeftThumbPressedRef = React.useRef(false);
  const autoSprintLeftThumbPressedRef = React.useRef(false);
  const supportedSystemUis = React.useMemo(() => [10, 19], []);

  const isTriggerWork = React.useRef(false);

  const syncLeftThumbButton = React.useCallback((state: any) => {
    if (!state || state !== gpState) {
      return;
    }
    state.LeftThumb =
      manualLeftThumbPressedRef.current || autoSprintLeftThumbPressedRef.current
        ? 1
        : 0;
  }, []);

  const setManualLeftThumbPressed = React.useCallback(
    (pressed: boolean) => {
      manualLeftThumbPressedRef.current = pressed;
      syncLeftThumbButton(gpState);
    },
    [syncLeftThumbButton],
  );

  const syncAutoSprint = React.useCallback(
    (state: any, autoSprintEnabled: boolean) => {
      if (!state || state !== gpState) {
        return;
      }

      autoSprintLeftThumbPressedRef.current =
        autoSprintEnabled &&
        (Math.abs(state.LeftThumbXAxis) > 0 ||
          Math.abs(state.LeftThumbYAxis) > 0);
      syncLeftThumbButton(state);
    },
    [syncLeftThumbButton],
  );

  React.useEffect(() => {
    let layoutTimer: any = null;
    const lockTimer = setTimeout(() => {
      if (portraitMode) {
        Orientation.lockToPortrait();
      } else {
        Orientation.lockToLandscape();
      }

      layoutTimer = setTimeout(() => {}, 100);
    }, 500);

    return () => {
      clearTimeout(lockTimer);
      if (layoutTimer) {
        clearTimeout(layoutTimer);
      }
      Orientation.unlockAllOrientations();
    };
  }, [route.params?.sessionId, route.params?.streamType, portraitMode]);

  const closeSystemKeyboardModal = React.useCallback(() => {
    NativeInputDialog?.dismiss?.();
    systemKeyboardTransactionRef.current = null;
  }, []);

  const completeSystemKeyboard = React.useCallback(
    (text: string) => {
      const transaction = systemKeyboardTransactionRef.current;
      if (
        transaction &&
        transaction.isTransaction &&
        transaction.completion &&
        typeof transaction.completion.complete === 'function'
      ) {
        transaction.completion.complete(
          JSON.stringify({
            Text: text,
          }),
        );
      }
      closeSystemKeyboardModal();
    },
    [closeSystemKeyboardModal],
  );

  const cancelSystemKeyboard = React.useCallback(() => {
    const transaction = systemKeyboardTransactionRef.current;
    if (
      transaction &&
      transaction.isTransaction &&
      transaction.completion &&
      typeof transaction.completion.cancel === 'function'
    ) {
      transaction.completion.cancel();
    }
    closeSystemKeyboardModal();
  }, [closeSystemKeyboardModal]);

  const showNativeInputDialog = React.useCallback(
    async (options: any) => {
      if (isInPictureInPicture || !NativeInputDialog?.showTextInput) {
        return null;
      }

      try {
        return await NativeInputDialog.showTextInput(options);
      } catch (error) {
        return null;
      }
    },
    [isInPictureInPicture],
  );

  const openSystemKeyboardDialog = React.useCallback(
    async (event: any, payload: any) => {
      systemKeyboardTransactionRef.current = {
        id: event.id,
        isTransaction: event.isTransaction,
        completion: event.completion,
      };

      if (
        event.isTransaction &&
        event.completion &&
        typeof event.completion.setOnRemoteCancellation === 'function'
      ) {
        const transactionId = event.id;
        event.completion.setOnRemoteCancellation(() => {
          if (systemKeyboardTransactionRef.current?.id === transactionId) {
            systemKeyboardTransactionRef.current = null;
            NativeInputDialog?.dismiss?.();
          }
        });
      }

      const result = await showNativeInputDialog({
        title: payload.TitleText || '',
        message: payload.DescriptionText || '',
        text: payload.DefaultText || '',
        hint: t('Text'),
        inputScope: payload.InputScope ?? 0,
        maxLength:
          typeof payload.MaxLength === 'number' && payload.MaxLength > 0
            ? payload.MaxLength
            : 0,
        confirmText: t('Confirm'),
        cancelText: t('Cancel'),
      });

      if (systemKeyboardTransactionRef.current?.id !== event.id) {
        return;
      }

      if (result?.action === 'confirm') {
        completeSystemKeyboard(result.text || '');
      } else {
        cancelSystemKeyboard();
      }
    },
    [cancelSystemKeyboard, completeSystemKeyboard, showNativeInputDialog, t],
  );

  const handleSystemUiEvent = React.useCallback(
    (event: any) => {
      if (!event || !event.target) {
        return false;
      }

      if (isRequestExit.current) {
        if (
          event.isTransaction &&
          event.completion &&
          typeof event.completion.cancel === 'function'
        ) {
          event.completion.cancel();
        }
        return true;
      }

      if (event.target === SYSTEM_UI_TARGET_SHOW_MESSAGE_DIALOG) {
        const payload = event.payload || {};
        const title = payload.TitleText || '';
        const content = payload.ContentText || '';
        const commandButtons = [
          {
            label: payload.CommandLabel1,
            result: 0,
          },
          {
            label: payload.CommandLabel2,
            result: 1,
          },
          {
            label: payload.CommandLabel3,
            result: 2,
          },
        ];
        let hasResponded = false;

        const completeWithResult = (result?: number) => {
          if (hasResponded) {
            return;
          }
          hasResponded = true;
          if (
            event.isTransaction &&
            event.completion &&
            typeof event.completion.complete === 'function'
          ) {
            event.completion.complete(
              JSON.stringify({
                Result: result,
              }),
            );
          }
        };

        const buttons: Array<any> = [];
        commandButtons.forEach(({label, result}) => {
          if (!label) {
            return;
          }
          const buttonText = String(label);
          buttons.push({
            text: buttonText,
            onPress: () => {
              completeWithResult(result);
              setTimeout(() => {
                if (buttonText.toUpperCase().indexOf('QUIT') !== -1) {
                  handleExitRef.current(false);
                }
              }, 500);
            },
          });
        });

        if (!buttons.length) {
          buttons.push({
            text: t('Confirm'),
            onPress: () => {
              const fallbackIndex =
                typeof payload.DefaultIndex === 'number'
                  ? payload.DefaultIndex
                  : 0;
              completeWithResult(fallbackIndex);
            },
          });
        }

        Alert.alert(title, content, buttons, {
          cancelable: true,
          onDismiss: () => {
            if (!event.isTransaction) {
              return;
            }

            const dismissIndex =
              typeof payload.CancelIndex === 'number'
                ? payload.CancelIndex
                : typeof payload.DefaultIndex === 'number'
                ? payload.DefaultIndex
                : 0;

            // Message dialog should always complete with a Result value.
            // Defer to avoid racing with button onPress callback order on Android.
            setTimeout(() => {
              completeWithResult(dismissIndex);
            }, 0);
          },
        });

        return true;
      }

      if (event.target === SYSTEM_UI_TARGET_SHOW_VIRTUAL_KEYBOARD) {
        const payload = event.payload || {};
        openSystemKeyboardDialog(event, payload);
        return true;
      }

      return false;
    },
    [openSystemKeyboardDialog, t],
  );

  const handleStreamingMessage = React.useCallback((event: any) => {
    if (!event || typeof event.target !== 'string') {
      return false;
    }

    if (!event.target.startsWith(STREAMING_TOUCHCONTROLS_SCOPE)) {
      return false;
    }

    if (
      event.isTransaction &&
      event.completion &&
      typeof event.completion.cancel === 'function'
    ) {
      event.completion.cancel();
    }

    return true;
  }, []);

  const applyRemoteAudioGain = React.useCallback((gain?: number) => {
    const nextGain =
      typeof gain === 'number' && Number.isFinite(gain)
        ? Math.max(0, Math.min(10, gain))
        : audioGainRef.current;
    const audioTracks = remoteStream.current?.getAudioTracks?.() ?? [];
    audioTracks.forEach((track: any) => {
      track?._setVolume?.(nextGain);
    });
  }, []);

  const handleAudioGainChange = React.useCallback(
    (value: number) => {
      const nextGain = Math.max(0, Math.min(10, Math.round(value)));
      audioGainRef.current = nextGain;
      setAudioGain(nextGain);
      applyRemoteAudioGain(nextGain);
    },
    [applyRemoteAudioGain],
  );

  const getStreamDestination = React.useCallback(() => {
    return route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
  }, [route.params?.streamType]);

  const finishStreamExit = React.useCallback(() => {
    setIsExiting(false);
    setLoading(false);
    Orientation.unlockAllOrientations();
    FullScreenManager.immersiveModeOff();
    // Cloud is now a tab inside the Main tab navigator; a cloud stream returns
    // to the Library tab through Main, otherwise back to the Home gate.
    if (getStreamDestination() === 'Cloud') {
      navigation.navigate('Main', {
        screen: 'Cloud',
        params: {needRefresh: true},
      });
    } else {
      navigation.navigate('Home', {needRefresh: true});
    }
  }, [getStreamDestination, navigation]);

  const waitStopStream = React.useCallback(async (api: any) => {
    try {
      await stopStreamWithTimeout(api);
    } catch (error) {
      log.warn('stopStream failed or timed out:', error);
    }
  }, []);

  // event
  const usbGpEventListener = React.useRef<any>(undefined);
  const sensorEventListener = React.useRef<any>(undefined);

  React.useEffect(() => {
    GamepadManager.setCurrentScreen('stream');
    const isUsbMode = route.params?.isUsbMode || false;
    const usbController = route.params?.usbController || 'Xbox360Controller';

    const _settings = getSettings();
    setSettings(_settings);
    resetGamepadState(gpState, 0);
    manualLeftThumbPressedRef.current = false;
    autoSprintLeftThumbPressedRef.current = false;
    const coopDeviceIndexMap = new Map<number, number>();
    const coopGpStates = _settings.coop
      ? [gpState, createGamepadState(1)]
      : null;
    if (coopGpStates) {
      resetGamepadState(coopGpStates[0], 0);
      resetGamepadState(coopGpStates[1], 1);
    }

    const sweap = obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [value, key]),
      );
    };

    if (isUsbMode) {
      defaultMaping = XBOX_360_GAMEPAD_MAPING;
      // console.log('defaultMaping:', defaultMaping);
    }
    let gpMaping = sweap(defaultMaping);
    if (!isUsbMode && _settings.native_gamepad_maping) {
      gpMaping = sweap(_settings.native_gamepad_maping);
    }
    const isSdlKernel = !isUsbMode && _settings.gamepad_kernal === 'SDL';

    const normaliseAxis = value => {
      if (_settings.dead_zone) {
        if (Math.abs(value) < _settings.dead_zone) {
          return 0;
        }

        value = value - Math.sign(value) * _settings.dead_zone;
        value /= 1.0 - _settings.dead_zone;

        // Joystick edge compensation
        const THRESHOLD = 0.8;
        const MAX_VALUE = 1;
        const compensation = _settings.edge_compensation / 100 || 0;
        if (Math.abs(value) > THRESHOLD) {
          if (value > 0) {
            value = Math.min(value + compensation, MAX_VALUE);
          } else {
            value = Math.max(value - compensation, -MAX_VALUE);
          }
        }
        return value;
      } else {
        return value;
      }
    };

    if (portraitMode) {
      FullScreenManager.immersiveModeOff();
    } else {
      FullScreenManager.immersiveModeOn();
    }

    const stopVibrate = () => {
      GamepadManager.vibrate(10, 0, 0, 0, 0, 3);
      isRumbling.current = false;
    };

    const resolveGamepadState = (rawGamepadIndex = 0) => {
      if (!_settings.coop || !coopGpStates) {
        return gpState;
      }

      const deviceIndex =
        typeof rawGamepadIndex === 'number' ? rawGamepadIndex : -1;
      if (deviceIndex < 0) {
        return null;
      }
      if (!coopDeviceIndexMap.has(deviceIndex)) {
        if (coopDeviceIndexMap.size >= coopGpStates.length) {
          return null;
        }
        coopDeviceIndexMap.set(deviceIndex, coopDeviceIndexMap.size);
      }

      const playerIndex = coopDeviceIndexMap.get(deviceIndex);
      if (playerIndex === undefined) {
        return null;
      }
      return coopGpStates[playerIndex];
    };

    const resetButtonState = () => {
      GAMEPAD_DIGITAL_KEYS.forEach(k => {
        gpState[k] = 0;
      });
      manualLeftThumbPressedRef.current = false;
      syncLeftThumbButton(gpState);
    };

    const getPressedButtons = combinedValue => {
      const pressedButtons: any = [];
      for (const [button, value] of Object.entries(XBOX_360_GAMEPAD_MAPING)) {
        // eslint-disable-next-line no-bitwise
        if ((combinedValue & value) === value) {
          pressedButtons.push(button);
        }
      }
      return pressedButtons;
    };

    const setGpState = combinedKeys => {
      manualLeftThumbPressedRef.current = combinedKeys.includes('LeftThumb');
      GAMEPAD_DIGITAL_KEYS.forEach(k => {
        if (k === 'LeftThumb') {
          return;
        }
        if (combinedKeys.includes(k)) {
          gpState[k] = 1;
        } else {
          gpState[k] = 0;
        }
      });
      syncLeftThumbButton(gpState);
    };

    // Anti-idle (opt-in, experimental): while backgrounded, send a tiny
    // self-cancelling right-stick (camera) nudge so xCloud's AFK idle timer
    // doesn't disconnect the session. See the setting's warning.
    const sendAntiIdleNudge = (x: number) => {
      const inputChannel = webrtcClient?.getChannelProcessor?.('input');
      if (!inputChannel) {
        return;
      }
      const frame = createGamepadState(0);
      frame.RightThumbXAxis = x;
      inputChannel.queueGamepadState(frame);
      inputChannel.flushGamepadInput?.();
    };
    const stopAntiIdle = () => {
      if (antiIdleTimerRef.current) {
        BackgroundTimer.clearInterval(antiIdleTimerRef.current);
        antiIdleTimerRef.current = null;
      }
      if (antiIdleResetTimerRef.current) {
        BackgroundTimer.clearTimeout(antiIdleResetTimerRef.current);
        antiIdleResetTimerRef.current = null;
      }
      sendAntiIdleNudge(0);
    };
    const startAntiIdle = (deadlineMs?: number) => {
      if (antiIdleTimerRef.current) {
        return;
      }
      if (deadlineMs && deadlineMs > Date.now()) {
        antiIdleDeadlineRef.current = deadlineMs;
      } else {
        const maxMinutes = Number(getSettings().anti_idle_max_minutes) || 30;
        antiIdleDeadlineRef.current = Date.now() + maxMinutes * 60 * 1000;
      }
      // Background-capable timer so the nudge keeps firing while backgrounded.
      antiIdleTimerRef.current = BackgroundTimer.setInterval(() => {
        // Stop extending once the configured max duration has elapsed; the
        // session is then allowed to idle-disconnect.
        if (Date.now() >= antiIdleDeadlineRef.current) {
          stopAntiIdle();
          return;
        }
        sendAntiIdleNudge(0.12);
        antiIdleResetTimerRef.current = BackgroundTimer.setTimeout(() => {
          sendAntiIdleNudge(0);
        }, 250);
      }, 45 * 1000);
    };

    const eventEmitter = new NativeEventEmitter();
    appStateSubscription.current && appStateSubscription.current.remove();
    appStateSubscription.current = AppState.addEventListener(
      'change',
      state => {
        if (state === 'active') {
          // Back in the foreground: drop the keep-alive service and anti-idle.
          StreamKeepAliveManager?.stop?.();
          stopAntiIdle();
          return;
        }
        if (state !== 'background' || !isConnected.current) {
          return;
        }
        // Anti-idle is controlled solely by the max-duration slider: 0 = off.
        const antiIdleMinutes =
          Number(getSettings().anti_idle_max_minutes) || 0;
        const antiIdleDeadline =
          antiIdleMinutes > 0 ? Date.now() + antiIdleMinutes * 60 * 1000 : 0;
        // Keep the process (and the live session) alive in the background via a
        // foreground service whose notification resumes the game on tap. When
        // anti-idle is on, the notification shows a live count-down to the
        // deadline so the user can see how much longer the session is kept awake.
        StreamKeepAliveManager?.start?.(
          t('Streaming in background'),
          antiIdleDeadline > 0
            ? t('BackgroundKeepAliveAntiIdle')
            : t('BackgroundKeepAliveNotification'),
          t('Disconnect'),
          antiIdleDeadline,
        );
        if (antiIdleDeadline > 0) {
          startAntiIdle(antiIdleDeadline);
        }
      },
    );

    // The keep-alive notification's "Disconnect" action emits this event.
    keepAliveDisconnectListener.current = DeviceEventEmitter.addListener(
      'StreamKeepAliveDisconnect',
      () => {
        exit();
      },
    );

    audioGainEventListener.current = eventEmitter.addListener(
      'NativeInputDialogAudioGainChange',
      event => {
        handleAudioGainChange(Number(event?.value ?? 1));
      },
    );

    // USB Mode
    if (isUsbMode) {
      log.info('Entry usb mode');
      log.info('Usb controller: ' + usbController);
      if (usbController === DUALSENSE) {
        UsbRumbleManager.setDsController(
          16,
          124,
          16,
          0,
          0,
          0,
          0,
          0,
          _settings.left_trigger_type || 0,
          _settings.left_trigger_effects || [],
          _settings.right_trigger_type || 0,
          _settings.right_trigger_effects || [],
        );
      }
      usbGpEventListener.current = eventEmitter.addListener(
        'onGamepadReport',
        params => {
          const {
            keyCode,
            leftTrigger,
            rightTrigger,
            leftStickX,
            leftStickY,
            rightStickX,
            rightStickY,
          } = params;

          // console.log('gpMaping:', gpMaping);
          // console.log('usb keyCode:', keyCode);
          // Button
          if (keyCode !== 0) {
            const keys = getPressedButtons(keyCode);
            setGpState(keys);
          } else {
            resetButtonState();
          }

          // Trigger
          gpState.LeftTrigger = leftTrigger;
          gpState.RightTrigger = rightTrigger;

          // Joystick
          gpState.LeftThumbXAxis = normaliseAxis(leftStickX);
          gpState.LeftThumbYAxis = normaliseAxis(leftStickY);
          syncAutoSprint(gpState, !!_settings.auto_sprint);
          gpState.RightThumbXAxis = normaliseAxis(rightStickX);
          gpState.RightThumbYAxis = normaliseAxis(rightStickY);
        },
      );

      timer.current = setInterval(() => {
        webrtcClient && webrtcClient.setGamepadState(gpState);
      }, 1000 / _settings.polling_rate);
    } else {
      log.info(isSdlKernel ? 'Entry SDL gamepad mode' : 'Entry normal mode');
      if (isSdlKernel) {
        Promise.resolve(
          SdlGamepadManager?.startController?.(
            _settings.dead_zone ?? 0,
            _settings.edge_compensation ?? 0,
            !!_settings.short_trigger,
            false,
          ),
        ).catch(() => {});
      }
      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          // console.log('onGamepadKeyDown:', event);
          // e.g. {"controllerIndex": 0, "deviceId": 31, "keyCode": 100}
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (_settings.short_trigger) {
              targetState[keyName] = 1;
            }
          } else {
            targetState[keyName] = 1;
          }
          if (keyName === 'LeftThumb' && targetState === gpState) {
            setManualLeftThumbPressed(true);
          }

          if (
            keyName === 'Menu' &&
            !portraitMode &&
            !isInPictureInPicture &&
            !menuLongPressTimer.current
          ) {
            menuLongPressTriggered.current = false;
            menuLongPressTimer.current = setTimeout(() => {
              menuLongPressTimer.current = undefined;
              menuLongPressTriggered.current = true;
              targetState.Menu = 0;
              setShowModal(true);
            }, 2000);
          }
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          // console.log('onGamepadKeyUp:', event);
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (_settings.short_trigger) {
              targetState[keyName] = 0;
            }
          } else {
            targetState[keyName] = 0;
          }
          if (keyName === 'LeftThumb' && targetState === gpState) {
            setManualLeftThumbPressed(false);
          }

          if (keyName === 'Menu') {
            if (menuLongPressTimer.current) {
              clearTimeout(menuLongPressTimer.current);
              menuLongPressTimer.current = undefined;
            }
            if (menuLongPressTriggered.current) {
              targetState.Menu = 0;
              menuLongPressTriggered.current = false;
            }
          }
        },
      );

      const syncDpadState = (pressedKeys, gamepadIndex = 0) => {
        const activeKeys = new Set(pressedKeys ?? []);
        const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
        const targetState = resolveGamepadState(gamepadIndex);
        if (!targetState) {
          return;
        }

        ['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'].forEach(direction => {
          const keyCode = _gpMaping[direction];
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          targetState[keyName] = activeKeys.has(keyCode) ? 1 : 0;
        });
      };

      dpDownEventListener.current = eventEmitter.addListener(
        'onDpadKeyDown',
        event => {
          // console.log('onDpadKeyDown:', event);
          const pressedKeys = Array.isArray(event.dpadIdxList)
            ? event.dpadIdxList
            : event.dpadIdx >= 0
            ? [event.dpadIdx]
            : [];
          syncDpadState(pressedKeys, event.gamepadIndex);
        },
      );

      dpUpEventListener.current = eventEmitter.addListener(
        'onDpadKeyUp',
        event => {
          // console.log('onDpadKeyUp:', event);
          syncDpadState([], event.gamepadIndex);
        },
      );

      stickEventListener.current = eventEmitter.addListener(
        'onStickMove',
        event => {
          // console.log('onStickMove:', event);
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          targetState.LeftThumbXAxis = normaliseAxis(event.leftStickX);
          targetState.LeftThumbYAxis = normaliseAxis(event.leftStickY);
          syncAutoSprint(targetState, !!_settings.auto_sprint);

          if (
            Math.abs(event.rightStickX) > 0.1 ||
            Math.abs(event.rightStickY) > 0.1
          ) {
            isRightstickMoving.current = true;
          } else {
            isRightstickMoving.current = false;
          }

          targetState.RightThumbXAxis = normaliseAxis(event.rightStickX);
          targetState.RightThumbYAxis = normaliseAxis(event.rightStickY);
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          // Notice: some controllers will emit onTrigger and onGamepadKeyDown at the same time

          if (
            !isTriggerWork.current &&
            (event.leftTrigger > 0 || event.rightTrigger > 0)
          ) {
            isTriggerWork.current = true;
          }

          if (!isTriggerWork.current) {
            return;
          }

          // Short trigger
          if (_settings.short_trigger) {
            triggerMax = _settings.dead_zone;
            if (event.leftTrigger >= triggerMax) {
              targetState.LeftTrigger = 1;
            } else {
              setTimeout(() => {
                targetState.LeftTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.leftTrigger >= 0.05) {
              targetState.LeftTrigger = event.leftTrigger;
            } else {
              setTimeout(() => {
                targetState.LeftTrigger = 0;
              }, 16);
            }
          }

          // Short trigger
          if (_settings.short_trigger) {
            triggerMax = _settings.dead_zone;
            if (event.rightTrigger >= triggerMax) {
              targetState.RightTrigger = 1;
            } else {
              setTimeout(() => {
                targetState.RightTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.rightTrigger >= 0.05) {
              targetState.RightTrigger = event.rightTrigger;
            } else {
              setTimeout(() => {
                targetState.RightTrigger = 0;
              }, 16);
            }
          }
        },
      );

      // Send gamepad state to webrtc
      timer.current = setInterval(() => {
        if (webrtcClient) {
          if (_settings.coop && coopGpStates) {
            webrtcClient.setGamepadState(coopGpStates);
          } else {
            webrtcClient.setGamepadState(gpState);
          }
        }
      }, 1000 / _settings.polling_rate);
    }

    // Sensor
    if (_settings.sensor) {
      const sensorManager =
        _settings.sensor === 2 ? GamepadSensorModule : SensorModule;

      sensorManager.startSensor(
        _settings.sensor_sensitivity_x,
        _settings.sensor_sensitivity_y,
      );

      sensorEventListener.current = eventEmitter.addListener(
        'SensorData',
        params => {
          const {x, y} = params;

          let stickX: any = x / 32767;
          let stickY: any = y / 32767;

          // gyroscope only work when Rightstick not moving
          if (!isRightstickMoving.current) {
            const scaleX =
              _settings.sensor_sensitivity_x > 10000
                ? _settings.sensor_sensitivity_x / 10000
                : 1;

            const scaleY =
              _settings.sensor_sensitivity_y > 10000
                ? _settings.sensor_sensitivity_y / 10000
                : 1;

            switch (_settings.sensor_invert) {
              case 1: // x
                stickX = -stickX;
                break;
              case 2: // y
                stickY = -stickY;
                break;
              case 3: // All
                stickX = -stickX;
                stickY = -stickY;
                break;
              case 4: // x <-> y
                const temp = stickX;
                stickX = stickY;
                stickY = temp;
                break;
              default:
                break;
            }
            // gyroscope only work when LT button press
            if (_settings.sensor_type === 1) {
              if (gpState.LeftTrigger >= _settings.dead_zone) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 2) {
              // LB
              if (gpState.LeftShoulder > 0) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 3) {
              // LT/LB
              if (
                gpState.LeftTrigger >= _settings.dead_zone ||
                gpState.LeftShoulder > 0
              ) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 4) {
              // Global
              gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
              gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
            }
          }
        },
      );
    }

    // Back action
    const beforeRemoveListener = navigation.addListener('beforeRemove', e => {
      stopVibrate();
      if (portraitMode && e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        Alert.alert(t('Warning'), t('Exit stream?'), [
          {
            text: t('Cancel'),
            style: 'cancel',
          },
          {
            text: t('Confirm'),
            style: 'destructive',
            onPress: async () => {
              const _streamApi =
                route.params?.streamType === 'cloud'
                  ? xCloudApiRef.current
                  : xHomeApiRef.current;
              isRequestExit.current = true;
              setLoading(true);
              setLoadingText(t('Disconnecting...'));
              setIsExiting(true);
              webrtcClient && webrtcClient.close();
              Orientation.unlockAllOrientations();
              await waitStopStream(_streamApi);
              finishStreamExit();
            },
          },
        ]);
        return;
      }
      if (Platform.isTV) {
        if (e.data.action.type !== 'GO_BACK') {
          navigation.dispatch(e.data.action);
        } else {
          // Exit directly in Android TV
          const _streamApi =
            route.params?.streamType === 'cloud'
              ? xCloudApiRef.current
              : xHomeApiRef.current;
          setLoading(true);
          setIsExiting(true);
          waitStopStream(_streamApi).then(finishStreamExit);
        }
      } else {
        if (e.data.action.type !== 'GO_BACK') {
          navigation.dispatch(e.data.action);
        } else {
          e.preventDefault();

          // Show confirm modal
          setShowModal(true);
          GamepadManager.setCurrentScreen('');
        }
      }
    });

    if (route.params?.sessionId) {
      log.info('Stream screen receive sessionId:', route.params?.sessionId);
    }
    if (route.params?.streamType) {
      log.info('Stream screen receive streamType:', route.params?.streamType);
    }

    if (!streamApi) {
      if (route.params?.streamType === 'cloud') {
        if (streamingTokens.xCloudToken) {
          const _xCloudApi = new XcloudApi(
            streamingTokens.xCloudToken.getDefaultRegion().baseUri,
            streamingTokens.xCloudToken.data.gsToken,
            'cloud',
            authentication,
          );
          setStreamApi(_xCloudApi);
          xCloudApiRef.current = _xCloudApi;
        }
      } else {
        if (streamingTokens.xHomeToken) {
          const _xHomeApi = new XcloudApi(
            streamingTokens.xHomeToken.getDefaultRegion().baseUri,
            streamingTokens.xHomeToken.data.gsToken,
            'home',
            authentication,
          );
          setStreamApi(_xHomeApi);
          xHomeApiRef.current = _xHomeApi;
        }
      }
    }

    if (streamApi && webrtcClient === undefined) {
      setWebrtcClient(new webRTCClient());
    }

    if (streamApi && webrtcClient !== undefined) {
      webrtcClient.init();

      remoteStream.current = new MediaStream(undefined);

      webrtcClient.setPollRate(_settings.polling_rate);
      webrtcClient.setMaxTouchPoints(
        Platform.isTV ? 0 : _settings.native_touch ? 10 : 0,
      );
      webrtcClient.setSupportedSystemUis(supportedSystemUis);
      webrtcClient.setSystemUiHandler(handleSystemUiEvent);
      webrtcClient.setMessageHandler(handleStreamingMessage);

      if (_settings.coop) {
        webrtcClient.setCoop();
      }

      webrtcClient.setTrackHandler(event => {
        const track = event.track;
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
        }
        remoteStream.current.addTrack(track, remoteStream.current);
        if (track?.kind === 'audio') {
          track?._setVolume?.(audioGainRef.current);
        }
      });

      webrtcClient.setSdpHandler((client, offer) => {
        streamApi
          .sendChatSdp(offer)
          .then(sdpResponse => {
            log.info('sendChatSdp.exchangeResponse:', sdpResponse);
            const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);

            webrtcClient.setRemoteOffer(sdpDetails.sdp);
          })
          .catch(error => {
            console.log('ChatSDP Exchange error:', error);
          });
      });

      webrtcClient.setConnectedHandler(state => {
        // If the session drops (incl. while backgrounded, e.g. xCloud's idle
        // disconnect), tear down the background keep-alive notification too.
        if (state === CLOSED || state === FAILED) {
          StreamKeepAliveManager?.stop?.();
          stopAntiIdle();
        }
        if (state === CONNECTED) {
          // Connected
          if (!isConnected.current) {
            ToastAndroid.show(t('Connected'), ToastAndroid.SHORT);

            if (_settings.coop) {
              setTimeout(() => {
                ToastAndroid.show(t('CoopTips'), ToastAndroid.SHORT);
              }, 3000);
            }
          }
          setLoadingText(`${t(CONNECTED)}`);
          setLoading(false);
          isConnected.current = true;

          // Ask for notification permission up front (Android 13+) so the
          // background keep-alive notification can actually be shown/tapped.
          if (
            Platform.OS === 'android' &&
            typeof Platform.Version === 'number' &&
            Platform.Version >= 33
          ) {
            PermissionsAndroid.request(
              'android.permission.POST_NOTIFICATIONS' as any,
            ).catch(() => {});
          }

          // Many OEMs suspend background execution within a few minutes and cut
          // the stream even with a foreground service; offer to whitelist the
          // app from battery optimization (once per session, only if needed).
          if (!batteryOptPromptRef.current) {
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

          // Alway show virtual gamepad
          if (portraitMode || _settings.show_virtual_gamead) {
            setShowVirtualGamepad(true);
          }

          // Alway show performance
          if (!portraitMode && _settings.show_performance) {
            setShowPerformance(true);
          }

          setRemote(remoteStream.current.toURL());

          const sendFrame = () => {
            webrtcClient &&
              webrtcClient
                .getChannelProcessor('input')
                ?.addProcessedFrame(createStableResolutionProcessedFrame());
          };
          setTimeout(() => {
            sendFrame();
          }, 2000);

          if (!frameTimer.current) {
            // Background-capable timer: RN's setInterval is paused when the app
            // is backgrounded, which would stall the frame feedback + keepalive
            // and let xCloud drop the session.
            frameTimer.current = BackgroundTimer.setInterval(() => {
              sendFrame();
            }, 10 * 1000);
          }

          // Start keepalive loop (background-capable, see above).
          if (!keepaliveInterval.current) {
            const keepaliveIntervalMs =
              streamApi?.getKeepaliveIntervalMs?.() ?? 20 * 1000;
            keepaliveInterval.current = BackgroundTimer.setInterval(() => {
              streamApi
                .sendKeepalive()
                .then(result => {
                  log.info('StartStream keepalive:', JSON.stringify(result));
                })
                .catch(error => {
                  log.error(
                    'Failed to send keepalive. Error details:\n',
                    JSON.stringify(error),
                  );
                });
            }, keepaliveIntervalMs);
          }

          if (!audioRumbleTimer.current && _settings.enable_audio_rumble) {
            audioRumbleTimer.current = setInterval(() => {
              webrtcClient.getAudioVolume().then(vol => {
                if (vol >= _settings.audio_rumble_threshold) {
                  GamepadManager.vibrate(
                    30,
                    10,
                    0,
                    0,
                    0,
                    _settings.rumble_intensity || 3,
                  );
                }
              });
            }, 16);
          }
        } else if (state === CLOSED) {
          if (isRequestExit.current) {
            return;
          }
          if (connectStateRef.current !== CONNECTED) {
            return;
          }
          // Session closed (incl. while backgrounded): auto-close the stream
          // screen so reopening the app doesn't show a black, dead stream.
          ToastAndroid.show(t('Streaming is closed'), ToastAndroid.SHORT);
          exit();
        } else if (state === FAILED) {
          if (isConnected.current) {
            // Dropped after being connected: auto-close the stream screen.
            ToastAndroid.show(t('Reconnected failed'), ToastAndroid.SHORT);
            exit();
          } else {
            Alert.alert(t('Warning'), t('NAT failed'), [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  exit();
                },
              },
            ]);
          }
        }

        // Toggle microphone
        setConnectState(state);
        connectStateRef.current = state;
      });

      webrtcClient.setRumbleHandler(rumbleData => {
        if (!_settings.vibration) {
          return;
        }
        // console.log('rumbleData:', rumbleData);
        if (isUsbMode) {
          // console.log('isUsbMode:', isUsbMode);
          if (route.params?.usbController === DUALSENSE) {
            let weakMagnitude = rumbleData.weakMagnitude * 255;
            let strongMagnitude = rumbleData.strongMagnitude * 255;
            if (weakMagnitude > 255) {
              weakMagnitude = 255;
            }
            if (strongMagnitude > 255) {
              strongMagnitude = 255;
            }
            UsbRumbleManager.setDsController(
              16,
              124,
              16,
              0,
              0,
              0,
              strongMagnitude, // left motor
              weakMagnitude, // right motor
              _settings.left_trigger_type || 0,
              _settings.left_trigger_effects || [],
              _settings.right_trigger_type || 0,
              _settings.right_trigger_effects || [],
            );
          } else {
            let weakMagnitude = rumbleData.weakMagnitude * 32767;
            let strongMagnitude = rumbleData.strongMagnitude * 32767;
            let leftTrigger = rumbleData.leftTrigger * 32767;
            let rightTrigger = rumbleData.rightTrigger * 32767;
            if (weakMagnitude > 32767) {
              weakMagnitude = 32767;
            }
            if (strongMagnitude > 32767) {
              strongMagnitude = 32767;
            }
            if (leftTrigger > 32767) {
              leftTrigger = 32767;
            }
            if (rightTrigger > 32767) {
              rightTrigger = 32767;
            }
            if (weakMagnitude > 0 || strongMagnitude > 0) {
              if (leftTrigger > 0 || rightTrigger > 0) {
                UsbRumbleManager.rumbleTriggers(leftTrigger, rightTrigger);
              } else {
                UsbRumbleManager.rumbleTriggers(0, 0);
              }
            } else {
              UsbRumbleManager.rumbleTriggers(0, 0);
            }
            UsbRumbleManager.rumble(weakMagnitude, strongMagnitude);

            if (rumbleData.duration < 20) {
              setTimeout(() => {
                UsbRumbleManager.rumble(0, 0);
                UsbRumbleManager.rumbleTriggers(0, 0);
              }, 300);
            }
          }
        } else {
          // Native android rumble
          let weakMagnitude = rumbleData.weakMagnitude * 100;
          let strongMagnitude = rumbleData.strongMagnitude * 100;
          let leftTrigger = rumbleData.leftTrigger * 100;
          let rightTrigger = rumbleData.rightTrigger * 100;
          const duration = Math.max(
            0,
            Math.min(10000, Math.floor(rumbleData.duration || 0)),
          );
          if (weakMagnitude > 100) {
            weakMagnitude = 100;
          }
          if (strongMagnitude > 100) {
            strongMagnitude = 100;
          }
          if (leftTrigger > 100) {
            leftTrigger = 100;
          }
          if (rightTrigger > 100) {
            rightTrigger = 100;
          }

          const shouldStop =
            weakMagnitude <= 0 &&
            strongMagnitude <= 0 &&
            leftTrigger <= 0 &&
            rightTrigger <= 0;
          if (shouldStop) {
            isRumbling.current = false;
            GamepadManager.vibrate(
              0,
              0,
              0,
              0,
              0,
              _settings.rumble_intensity || 3,
            );
            return;
          }

          isRumbling.current = true;
          GamepadManager.vibrate(
            duration > 0 ? duration : 30,
            weakMagnitude,
            strongMagnitude,
            leftTrigger,
            rightTrigger,
            _settings.rumble_intensity || 3,
          );
        }
      });

      const exit = async () => {
        setLoading(false);
        webrtcClient && webrtcClient.close();
        await waitStopStream(streamApi);
        finishStreamExit();
      };

      setLoading(true);
      setLoadingText(`${t('Connecting...')}`);

      const setCodec = sdp => {
        const codec = _settings.codec;
        const codecArr = codec.split('-');
        const mimeType = codecArr[0]; // H264
        const profiles = codecArr[1]; // ['4d'] 4d = high, 42e = mid, 420 = low

        if (!mimeType || !profiles) {
          return sdp;
        }
        const capabilities = RTCRtpReceiver.getCapabilities('video');

        if (capabilities === null) {
          return sdp;
        }

        const codecs: any = capabilities.codecs;
        const prefCodecs: any = [];

        for (let i = 0; i < codecs.length; i++) {
          if (codecs[i].mimeType === mimeType) {
            if (profiles.length > 0) {
              for (let j = 0; j < profiles.length; j++) {
                if (
                  codecs[i].sdpFmtpLine?.indexOf(
                    'profile-level-id=' + profiles[j],
                  ) !== -1
                ) {
                  console.log(
                    'Adding codec as preference:',
                    codecs[i],
                    profiles[j],
                  );
                  prefCodecs.push(codecs[i]);
                }
              }
            } else {
              console.log('Adding codec as preference:', codecs[i]);
              prefCodecs.push(codecs[i]);
            }
          }
        }

        if (prefCodecs.length === 0) {
          console.log(
            'setCodec() No video codec matches with mimetype:',
            mimeType,
          );
          return sdp;
        }

        if (mimeType.indexOf('H264') > -1) {
          // High=4d Medium=42e Low=420
          const h264Pattern = /a=fmtp:(\d+).*profile-level-id=([0-9a-f]{6})/g;
          const profilePrefix = profiles[0];
          const preferredCodecIds: any = [];
          // Find all H.264 codec profile IDs
          const matches = sdp.matchAll(h264Pattern) || [];
          for (const match of matches) {
            const id = match[1];
            const profileId = match[2];

            if (profileId.startsWith(profilePrefix)) {
              preferredCodecIds.push(id);
            }
          }
          // No preferred IDs found
          if (!preferredCodecIds.length) {
            return sdp;
          }

          const lines = sdp.split('\r\n');
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (!line.startsWith('m=video')) {
              continue;
            }

            // https://datatracker.ietf.org/doc/html/rfc4566#section-5.14
            // m=<media> <port> <proto> <fmt>
            // m=video 9 UDP/TLS/RTP/SAVPF 127 39 102 104 106 108
            const tmp = line.trim().split(' ');

            // Get array of <fmt>
            // ['127', '39', '102', '104', '106', '108']
            let ids = tmp.slice(3);

            // Remove preferred IDs in the original array
            ids = ids.filter(item => !preferredCodecIds.includes(item));

            // Put preferred IDs at the beginning
            ids = preferredCodecIds.concat(ids);

            // Update line's content
            lines[lineIndex] = tmp.slice(0, 3).concat(ids).join(' ');

            break;
          }

          return lines.join('\r\n');
        }
      };

      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(() => {
          setLoadingText(
            `${t('Configuration obtained successfully, initiating offer...')}`,
          );
          webrtcClient.createOffer().then(offer => {
            // Set codec
            if (_settings.codec !== '') {
              offer.sdp = setCodec(offer.sdp);
            }

            streamApi
              .sendSDPOffer(offer)
              .then(sdpResponse => {
                setLoadingText(
                  `${t('Remote offer retrieved successfully...')}`,
                );
                log.info('sdpResponse.exchangeResponse:', sdpResponse);
                const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
                webrtcClient.setRemoteOffer(sdpDetails.sdp).then(() => {
                  setLoadingText(`${t('Ready to send ICE...')}`);
                  const iceCandidates = webrtcClient.getIceCandidates();
                  streamApi
                    .sendICECandidates(iceCandidates)
                    .then(iceDetails => {
                      log.info(
                        'Client - ICE iceDetails:',
                        JSON.stringify(iceDetails),
                      );
                      webrtcClient.setIceCandidates(iceDetails);
                      setLoadingText(`${t('Exchange ICE successfully...')}`);
                    })
                    .catch(e => {
                      Alert.alert(
                        t('Warning'),
                        '[sendICECandidates] fail:' + e,
                        [
                          {
                            text: t('Confirm'),
                            style: 'default',
                            onPress: () => {
                              exit();
                            },
                          },
                        ],
                      );
                    });
                });
              })
              .catch(e => {
                Alert.alert(t('Warning'), '[sendSDPOffer] fail:' + e, [
                  {
                    text: t('Confirm'),
                    style: 'default',
                    onPress: () => {
                      exit();
                    },
                  },
                ]);
              });
          });
        })
        .catch(e => {
          if (e !== '') {
            let msg = '';
            if (typeof e === 'string') {
              if (e.includes('WaitingForServerToRegister')) {
                if (e.includes('disabled streaming')) {
                  msg = '[StartSession] Fail:' + t('DisabledStreamingErr') + e;
                } else {
                  msg =
                    '[StartSession] Fail:' +
                    t('WaitingForServerToRegister') +
                    e;
                }
              } else if (e.includes('xboxstreaminghelper.cpp')) {
                msg = '[StartSession] Fail:' + t('XboxstreaminghelperErr') + e;
              } else {
                msg = '[StartSession] Fail:' + e;
              }
            } else {
              if (e.message?.indexOf('400') > -1) {
                const error =
                  route.params?.streamType === 'cloud'
                    ? t('noAllow')
                    : t('homeNoAllow');
                msg =
                  `[StartSession](${
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home'
                  }) - (${route.params?.sessionId}) Fail:` + error;
              } else {
                msg =
                  `[StartSession](${
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home'
                  }) - (${route.params?.sessionId}) Fail:` + e;
              }
            }
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  Orientation.unlockAllOrientations();
                  if (route.params?.streamType === 'cloud') {
                    navigation.navigate('Main', {screen: 'Cloud'});
                  } else {
                    navigation.navigate('Home');
                  }
                },
              },
            ]);
          }
        });
    }

    return () => {
      beforeRemoveListener();
      FullScreenManager.immersiveModeOff();
      stopVibrate();
      webrtcClient && webrtcClient.close();
      usbGpEventListener.current && usbGpEventListener.current.remove();
      gpDownEventListener.current && gpDownEventListener.current.remove();
      gpUpEventListener.current && gpUpEventListener.current.remove();
      dpDownEventListener.current && dpDownEventListener.current.remove();
      dpUpEventListener.current && dpUpEventListener.current.remove();
      stickEventListener.current && stickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      sensorEventListener.current && sensorEventListener.current.remove();
      appStateSubscription.current && appStateSubscription.current.remove();
      audioGainEventListener.current && audioGainEventListener.current.remove();
      keepAliveDisconnectListener.current &&
        keepAliveDisconnectListener.current.remove();
      StreamKeepAliveManager?.stop?.();
      if (antiIdleTimerRef.current) {
        BackgroundTimer.clearInterval(antiIdleTimerRef.current);
        antiIdleTimerRef.current = null;
      }
      if (antiIdleResetTimerRef.current) {
        BackgroundTimer.clearTimeout(antiIdleResetTimerRef.current);
        antiIdleResetTimerRef.current = null;
      }
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      if (menuLongPressTimer.current) {
        clearTimeout(menuLongPressTimer.current);
        menuLongPressTimer.current = null;
      }
      if (frameTimer.current) {
        BackgroundTimer.clearInterval(frameTimer.current);
        frameTimer.current = null;
      }
      if (keepaliveInterval.current) {
        BackgroundTimer.clearInterval(keepaliveInterval.current);
        keepaliveInterval.current = null;
      }
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
      if (audioRumbleTimer.current) {
        clearInterval(audioRumbleTimer.current);
        audioRumbleTimer.current = null;
      }
      macroSequenceTimersRef.current.forEach(timeoutId =>
        clearTimeout(timeoutId),
      );
      macroSequenceTimersRef.current = [];
      manualLeftThumbPressedRef.current = false;
      autoSprintLeftThumbPressedRef.current = false;
      syncLeftThumbButton(gpState);
      GamepadManager.setCurrentScreen('');
      SdlGamepadManager?.stopController?.();
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
      closeSystemKeyboardModal();
    };
  }, [
    t,
    route.params?.sessionId,
    route.params?.streamType,
    route.params?.isUsbMode,
    route.params?.usbController,
    webrtcClient,
    streamApi,
    streamingTokens,
    navigation,
    authentication,
    handleSystemUiEvent,
    handleStreamingMessage,
    applyRemoteAudioGain,
    handleAudioGainChange,
    closeSystemKeyboardModal,
    finishStreamExit,
    waitStopStream,
    supportedSystemUis,
    portraitMode,
    isInPictureInPicture,
    setManualLeftThumbPressed,
    syncAutoSprint,
    syncLeftThumbButton,
  ]);

  React.useEffect(() => {
    if (
      connectState !== CONNECTED ||
      !showPerformance ||
      !webrtcClient ||
      typeof webrtcClient.getStreamState !== 'function'
    ) {
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
      return;
    }

    const updatePerformance = () => {
      webrtcClient
        .getStreamState()
        .then(res => {
          setPerformance(res);
        })
        .catch(() => {});
    };

    updatePerformance();
    performanceInterval.current = setInterval(updatePerformance, 1000);

    return () => {
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
    };
  }, [connectState, showPerformance, webrtcClient]);

  const handlePowerOff = React.useCallback(async () => {
    const webApi = new WebApi(webToken);
    const powerOffRes = await webApi.powerOff(route.params?.sessionId);
    console.log('powerOff:', powerOffRes);
  }, [route.params?.sessionId, webToken]);

  const handleSendMessage = React.useCallback(
    async (rawMessage: string) => {
      const webApi = new WebApi(webToken);
      setMessageSending(true);
      let text = rawMessage.trim();
      if (text.length > 100) {
        text = text.substring(0, 100);
      }
      try {
        await webApi.sendText(route.params?.sessionId, text);
        ToastAndroid.show(t('Sended'), ToastAndroid.SHORT);
      } catch (e) {}
      setMessageSending(false);
    },
    [route.params?.sessionId, t, webToken],
  );

  const openSendTextDialog = React.useCallback(async () => {
    if (messageSending) {
      return;
    }

    const result = await showNativeInputDialog({
      title: t('Send text'),
      hint: t('Text'),
      text: '',
      maxLength: 100,
      confirmText: t('Send'),
      cancelText: t('Cancel'),
    });

    if (result?.action === 'confirm') {
      await handleSendMessage(result.text || '');
    }
  }, [handleSendMessage, messageSending, showNativeInputDialog, t]);

  const handleExit = React.useCallback(
    async (off = false) => {
      setLoading(true);
      setLoadingText(t('Disconnecting...'));
      if (isExiting) {
        return;
      }
      setIsExiting(true);
      webrtcClient && webrtcClient.close();
      await waitStopStream(streamApi);
      if (off) {
        handlePowerOff();
      }
      finishStreamExit();
    },
    [
      finishStreamExit,
      handlePowerOff,
      isExiting,
      streamApi,
      t,
      waitStopStream,
      webrtcClient,
    ],
  );
  handleExitRef.current = handleExit;

  const handleCloseModal = React.useCallback(() => {
    setShowModal(false);
    GamepadManager.setCurrentScreen('stream');

    if (!isConnected.current) {
      setLoading(true);
    }
  }, []);

  const clearMacroTimers = React.useCallback(() => {
    macroSequenceTimersRef.current.forEach(timeoutId =>
      clearTimeout(timeoutId),
    );
    macroSequenceTimersRef.current = [];
    isMacroLoopRunningRef.current = false;
    Array.from(activeMacroButtonsRef.current).forEach(button => {
      if (button === 'LeftThumb') {
        setManualLeftThumbPressed(false);
      } else {
        gpState[button] = 0;
      }
    });
    activeMacroButtonsRef.current.clear();
    Array.from(activeMacroSticksRef.current).forEach(stick => {
      if (stick === 'right') {
        gpState.RightThumbXAxis = 0;
        gpState.RightThumbYAxis = 0;
      } else {
        gpState.LeftThumbXAxis = 0;
        gpState.LeftThumbYAxis = 0;
        syncAutoSprint(gpState, !!settings.auto_sprint);
      }
    });
    activeMacroSticksRef.current.clear();
  }, [setManualLeftThumbPressed, settings.auto_sprint, syncAutoSprint]);

  const runMacroSteps = (rawSteps: any) => {
    const allowedButtons = new Set<string>(VIRTUAL_MACRO_ALLOWED_BUTTONS);
    const steps = normalizeMacroSteps(
      rawSteps,
      DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
    );
    let accumulatedDelay = 0;

    const schedule = (delay: number, fn: () => void) => {
      const timeoutId = setTimeout(() => {
        fn();
        macroSequenceTimersRef.current = macroSequenceTimersRef.current.filter(
          item => item !== timeoutId,
        );
      }, delay);
      macroSequenceTimersRef.current.push(timeoutId);
    };

    steps.forEach((step: any) => {
      const duration = Math.max(30, Number(step.durationMs) || 80);
      const waitAfter = Math.max(0, Number(step.waitAfterMs) || 0);

      if (step.type === 'stick') {
        const stick = step.stick === 'right' ? 'right' : 'left';
        const x = Math.max(-1, Math.min(1, Number(step.x) || 0));
        const y = Math.max(-1, Math.min(1, Number(step.y) || 0));

        schedule(accumulatedDelay, () => {
          activeMacroSticksRef.current.add(stick);
          if (stick === 'right') {
            gpState.RightThumbXAxis = x;
            gpState.RightThumbYAxis = y;
          } else {
            gpState.LeftThumbXAxis = x;
            gpState.LeftThumbYAxis = y;
            syncAutoSprint(gpState, !!settings.auto_sprint);
          }
        });
        schedule(accumulatedDelay + duration, () => {
          activeMacroSticksRef.current.delete(stick);
          if (stick === 'right') {
            gpState.RightThumbXAxis = 0;
            gpState.RightThumbYAxis = 0;
          } else {
            gpState.LeftThumbXAxis = 0;
            gpState.LeftThumbYAxis = 0;
            syncAutoSprint(gpState, !!settings.auto_sprint);
          }
        });
        accumulatedDelay += duration + waitAfter;
        return;
      }

      const stepButtons = Array.isArray(step?.buttons)
        ? step.buttons.filter((button: string) => allowedButtons.has(button))
        : [];

      if (!stepButtons.length) {
        return;
      }

      schedule(accumulatedDelay, () => {
        stepButtons.forEach((button: string) => {
          activeMacroButtonsRef.current.add(button);
          if (button === 'LeftThumb') {
            setManualLeftThumbPressed(true);
          } else {
            gpState[button] = 1;
          }
        });
      });
      schedule(accumulatedDelay + duration, () => {
        stepButtons.forEach((button: string) => {
          activeMacroButtonsRef.current.delete(button);
          if (button === 'LeftThumb') {
            setManualLeftThumbPressed(false);
          } else {
            gpState[button] = 0;
          }
        });
      });
      accumulatedDelay += duration + waitAfter;
    });

    return accumulatedDelay;
  };

  const handleMacroPressIn = () => {
    const shortSteps = Array.isArray(settings.virtual_macro_short_press_steps)
      ? settings.virtual_macro_short_press_steps
      : [];
    const longSteps = Array.isArray(settings.virtual_macro_long_press_steps)
      ? settings.virtual_macro_long_press_steps
      : [];
    const rawSteps = shortSteps.length ? shortSteps : longSteps;
    if (settings.virtual_macro_loop_enabled) {
      if (isMacroLoopRunningRef.current) {
        clearMacroTimers();
        return;
      }

      clearMacroTimers();
      isMacroLoopRunningRef.current = true;
      const interval = normalizeMacroLoopIntervalMs(
        settings.virtual_macro_loop_interval_ms,
      );
      const runLoop = () => {
        if (!isMacroLoopRunningRef.current) {
          return;
        }
        const totalDuration = runMacroSteps(rawSteps);
        if (!totalDuration) {
          clearMacroTimers();
          return;
        }
        const delay = Math.max(30, totalDuration + interval);
        const timeoutId = setTimeout(() => {
          macroSequenceTimersRef.current =
            macroSequenceTimersRef.current.filter(item => item !== timeoutId);
          runLoop();
        }, delay);
        macroSequenceTimersRef.current.push(timeoutId);
      };
      runLoop();
      return;
    }

    clearMacroTimers();
    runMacroSteps(rawSteps);

    if (settings.vibration) {
      Vibration.vibrate(20);
    }
  };

  const handleMacroPressOut = () => {};

  // Virtual gamepad press start
  // Push the current virtual-gamepad state to the input channel immediately.
  // The input driver otherwise only samples gpState on its ~16ms poll, so a
  // fast tap (or rapid repeats) could be merged into a single hold or dropped
  // entirely. Sending the transition right away makes each press/release its
  // own edge. queueGamepadState snapshots the object, so a later release can't
  // overwrite an already-queued press.
  const flushVirtualGpState = () => {
    const inputChannel = webrtcClient?.getChannelProcessor?.('input');
    inputChannel?.queueGamepadState(gpState);
    inputChannel?.flushGamepadInput?.();
  };

  // Auto-fire: while held, rapidly toggle the button so it repeats.
  const startTurbo = (name: string) => {
    if (turboTimersRef.current[name]) {
      return;
    }
    let on = true;
    gpState[name] = 1;
    flushVirtualGpState();
    turboTimersRef.current[name] = setInterval(() => {
      on = !on;
      gpState[name] = on ? 1 : 0;
      flushVirtualGpState();
    }, 60);
  };

  const stopTurbo = (name: string) => {
    const timer = turboTimersRef.current[name];
    if (timer) {
      clearInterval(timer);
      delete turboTimersRef.current[name];
    }
    gpState[name] = 0;
    flushVirtualGpState();
  };

  const handleButtonPressIn = name => {
    if (name === VIRTUAL_MACRO_BUTTON_NAME) {
      handleMacroPressIn();
      return;
    }

    if (turboSetRef.current.has(name)) {
      startTurbo(name);
      if (settings.vibration) {
        Vibration.vibrate(30);
      }
      return;
    }

    const hold_buttons = settings.hold_buttons || [];
    if (name === 'LeftThumb') {
      setManualLeftThumbPressed(
        hold_buttons.includes(name) ? !manualLeftThumbPressedRef.current : true,
      );
      if (settings.vibration) {
        Vibration.vibrate(30);
      }
      return;
    }

    // Hold button
    if (hold_buttons.includes(name)) {
      gpState[name] = gpState[name] === 1 ? 0 : 1;
      flushVirtualGpState();
      return;
    }
    gpState[name] = 1;
    flushVirtualGpState();

    if (settings.vibration) {
      Vibration.vibrate(30);
    }
  };

  // Virtual gamepad press end
  const handleButtonPressOut = name => {
    if (name === VIRTUAL_MACRO_BUTTON_NAME) {
      handleMacroPressOut();
      return;
    }

    if (turboTimersRef.current[name]) {
      stopTurbo(name);
      return;
    }

    const hold_buttons = settings.hold_buttons || [];
    if (name === 'LeftThumb') {
      if (hold_buttons.includes(name)) {
        return;
      }
      setTimeout(() => {
        setManualLeftThumbPressed(false);
      }, 50);
      return;
    }

    // Hold button
    if (hold_buttons.includes(name)) {
      return;
    }
    // Release immediately (and flush) instead of deferring 50ms. The old delay
    // guaranteed the ~16ms poll sampled the press, but it also merged rapid
    // taps into one hold and let a stale timer clear a newer press. The
    // immediate flush on press/release delivers each edge reliably without it.
    gpState[name] = 0;
    flushVirtualGpState();
  };

  // Keep stable refs to the latest press handlers so the cover-display bus can
  // call them without re-registering every render.
  coverPressInRef.current = handleButtonPressIn;
  coverPressOutRef.current = handleButtonPressOut;

  // React to cover present-capability changes (device opened/closed): keep the
  // availability + presented flags in sync and auto-present the cover controls
  // when the device is unfolded during a game, so no manual step is needed.
  const handleCoverStatus = React.useCallback((s: string) => {
    setCoverAvailable(s === 'AVAILABLE' || s === 'ACTIVE');
    setCoverPresented(s === 'ACTIVE');
    if (
      s === 'AVAILABLE' &&
      connectStateRef.current === CONNECTED &&
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
    if (connectState !== CONNECTED) {
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

  // Virtual gamepad stick move
  const handleStickMove = (id, data) => {
    // console.log('handleStickMove:', id, data);
    let leveledX: any = data.x;
    let leveledY: any = data.y;

    if (typeof leveledX === 'number') {
      leveledX = leveledX.toFixed(2);
    }
    if (typeof leveledY === 'number') {
      leveledY = leveledY.toFixed(2);
    }

    if (id === 'right') {
      if (Math.abs(leveledX) > 0 || Math.abs(leveledY) > 0) {
        isRightstickMoving.current = true;
      } else {
        isRightstickMoving.current = false;
      }
      gpState.RightThumbXAxis = Number(leveledX);
      gpState.RightThumbYAxis = Number(leveledY);
    } else {
      gpState.LeftThumbXAxis = Number(leveledX);
      gpState.LeftThumbYAxis = Number(leveledY);
      syncAutoSprint(gpState, !!settings.auto_sprint);
    }
  };

  // Swipe-aim is configured per touch-controller profile, so it follows the
  // active profile. Re-read when the profile or its saved config changes.
  const activeSwipe = React.useMemo(
    () => getSwipeConfig(settings.custom_virtual_gamepad || ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.custom_virtual_gamepad, swipeConfigVersion],
  );

  // The swipe-aim trackpad rectangle for the active profile (from its layout;
  // a sensible default when the profile has no SwipeAim element or is Default).
  const activeSwipeRect = React.useMemo(() => {
    const {width, height} = Dimensions.get('window');
    const fallback = createDefaultSwipePad(width, height);
    const name = settings.custom_virtual_gamepad;
    if (name) {
      const layout = getGamepadLayouts()[name];
      const pad = Array.isArray(layout)
        ? layout.find((b: any) => b?.name === SWIPE_AIM_NAME)
        : null;
      if (pad) {
        return pad;
      }
    }
    return fallback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.custom_virtual_gamepad, gamepadLayoutVersion]);

  // Rebuild the set of turbo-enabled button names for the active profile.
  React.useEffect(() => {
    const name = settings.custom_virtual_gamepad;
    const layout = name ? getGamepadLayouts()[name] : null;
    const set = new Set<string>();
    if (Array.isArray(layout)) {
      layout.forEach((b: any) => {
        if (b?.turbo) {
          set.add(b.name);
        }
      });
    }
    turboSetRef.current = set;
  }, [settings.custom_virtual_gamepad, gamepadLayoutVersion]);

  // Clear any running turbo timers when leaving the stream screen.
  React.useEffect(() => {
    const timers = turboTimersRef.current;
    return () => {
      Object.keys(timers).forEach(n => clearInterval(timers[n]));
    };
  }, []);

  // Virtual-stick mode (0 = fixed, 1 = free) for the active profile; the
  // per-profile override wins, else the global setting.
  const activeJoystickMode = React.useMemo(() => {
    const stored = getJoystickMode(settings.custom_virtual_gamepad || '');
    return stored === null ? Number(settings.virtual_gamepad_joystick) : stored;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.custom_virtual_gamepad,
    settings.virtual_gamepad_joystick,
    swipeConfigVersion,
  ]);

  // Swipe-to-aim: translate a finger drag into right-stick (camera) velocity,
  // then recentre shortly after the finger stops moving so a still finger means
  // "no camera movement" (relative aiming, like mobile shooters).
  const swipeAimResetTimer = React.useRef<any>(null);

  const clearSwipeAim = () => {
    if (swipeAimResetTimer.current) {
      clearTimeout(swipeAimResetTimer.current);
      swipeAimResetTimer.current = null;
    }
    gpState.RightThumbXAxis = 0;
    gpState.RightThumbYAxis = 0;
    isRightstickMoving.current = false;
    flushVirtualGpState();
  };

  const handleSwipeAim = (dx: number, dy: number) => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const invertY = activeSwipe.invertY;
    gpState.RightThumbXAxis = clamp(dx);
    // Screen y is down-positive; a right stick pushed up (look up) is positive,
    // so negate by default. Invert flips it back.
    gpState.RightThumbYAxis = clamp(invertY ? dy : -dy);
    isRightstickMoving.current = true;
    flushVirtualGpState();
    if (swipeAimResetTimer.current) {
      clearTimeout(swipeAimResetTimer.current);
    }
    swipeAimResetTimer.current = setTimeout(clearSwipeAim, 60);
  };

  const requestExit = React.useCallback(
    (off = false) => {
      clearMacroTimers();
      isRequestExit.current = true;
      setShowPerformance(false);
      setShowVirtualGamepad(false);
      webrtcClient && webrtcClient.close();
      setShowModal(false);
      if (settings.sensor) {
        SensorModule.stopSensor();
        GamepadSensorModule.stopSensor();
      }
      handleExit(off);
    },
    [clearMacroTimers, handleExit, settings.sensor, webrtcClient],
  );

  const handleToggleMic = React.useCallback(async () => {
    if (!webrtcClient) {
      return;
    }

    const chatChannel = webrtcClient.getChannelProcessor('chat');

    if (chatChannel.isPaused === true) {
      const started = await chatChannel.startMic();
      setOpenMicro(Boolean(started));

      if (!started) {
        Alert.alert(
          t('Warning'),
          'Failed to open microphone. Please check microphone permission.',
        );
      }
    } else {
      chatChannel.stopMic();
      setOpenMicro(false);
    }

    handleCloseModal();
  }, [handleCloseModal, t, webrtcClient]);

  const getActiveProfileName = React.useCallback(() => {
    return settings.custom_virtual_gamepad || LIVE_GAMEPAD_PROFILE;
  }, [settings.custom_virtual_gamepad]);

  const refreshGamepadProfiles = React.useCallback(() => {
    setGamepadProfiles(Object.keys(getGamepadLayouts()));
  }, []);

  const handleOpenGamepadEditor = React.useCallback(() => {
    refreshGamepadProfiles();
    setEditorProfile(getActiveProfileName());
    setShowGamepadEditor(true);
  }, [getActiveProfileName, refreshGamepadProfiles]);

  // Switch the live/active touch layout. '' selects the built-in Default.
  const applyActiveProfile = React.useCallback(
    (name: string) => {
      const next = {...getSettings(), custom_virtual_gamepad: name};
      saveSettings(next);
      setSettings(next);
      setEditorProfile(name || LIVE_GAMEPAD_PROFILE);
      setGamepadLayoutVersion(prev => prev + 1);
      setSwipeConfigVersion(prev => prev + 1);
      coverGamepadBus.setLayout(getCoverLayout(name || ''));
      setShowVirtualGamepad(true);
      // Remember this as the profile last used for this game so it is restored
      // the next time the game launches.
      setLastProfileForGame(String(route.params?.sessionId || ''), name);
    },
    [route.params?.sessionId],
  );

  const handleSwitchGamepadProfile = React.useCallback(
    (name: string) => {
      applyActiveProfile(name);
    },
    [applyActiveProfile],
  );

  const handleCreateGamepadProfile = React.useCallback(
    (rawName: string, copyFrom = '') => {
      const name = rawName.trim();
      if (!name) {
        return;
      }
      const layouts = getGamepadLayouts();
      if (!layouts[name]) {
        const source = copyFrom && layouts[copyFrom];
        const seed = Array.isArray(source)
          ? // Copy an existing profile's layout as the starting point.
            source.map((button: any) => ({...button}))
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

  const handleDeleteGamepadProfile = React.useCallback(
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

  const handleSaveGamepadLayout = (
    layout: ButtonConfig[],
    swipe?: {sensitivity: number; invertY: boolean},
    joystickMode?: number,
  ) => {
    const profileName = editorProfile || getActiveProfileName();
    saveGamepadLayout(profileName, layout);
    if (swipe) {
      // Swipe-aim is per-profile; store it under the profile that will be
      // active after this save (the render gate keys off that name).
      setSwipeConfig(profileName, swipe);
    }
    if (joystickMode === 0 || joystickMode === 1) {
      setJoystickMode(profileName, joystickMode);
    }
    if (!settings.custom_virtual_gamepad) {
      settings.custom_virtual_gamepad = profileName;
    }
    saveSettings(settings);
    setSettings({...settings});
    setGamepadLayoutVersion(prev => prev + 1);
    setSwipeConfigVersion(prev => prev + 1);
    setShowVirtualGamepad(true);
    setShowGamepadEditor(false);
    setLastProfileForGame(
      String(route.params?.sessionId || ''),
      settings.custom_virtual_gamepad || '',
    );
  };

  // On launch, switch to the touch-controller profile last used for this game.
  const profileRestoredRef = React.useRef(false);
  React.useEffect(() => {
    if (profileRestoredRef.current) {
      return;
    }
    profileRestoredRef.current = true;
    const gameId = String(route.params?.sessionId || '');
    if (!gameId) {
      return;
    }
    const last = getLastProfileForGame(gameId);
    if (last === null) {
      return;
    }
    // '' (Default) is always valid; a named profile must still exist.
    if (last !== '' && !getGamepadLayouts()[last]) {
      return;
    }
    const cur = getSettings();
    if ((cur.custom_virtual_gamepad || '') === last) {
      return;
    }
    const next = {...cur, custom_virtual_gamepad: last};
    saveSettings(next);
    setSettings(next);
    setGamepadLayoutVersion(prev => prev + 1);
    setSwipeConfigVersion(prev => prev + 1);
  }, [route.params?.sessionId]);

  // Once connected, remember whatever profile is active for this game, so a
  // game the user never re-profiles still restores its current layout.
  React.useEffect(() => {
    if (connectState !== CONNECTED) {
      return;
    }
    const gameId = String(route.params?.sessionId || '');
    if (!gameId) {
      return;
    }
    setLastProfileForGame(gameId, getSettings().custom_virtual_gamepad || '');
  }, [connectState, route.params?.sessionId]);

  const savePortraitGamepadLayout = React.useCallback(
    (layout: PortraitGamepadControl[]) => {
      const nextSettings = {
        ...getSettings(),
        native_portrait_gamepad_layout: layout,
      };
      saveSettings(nextSettings);
      setSettings(nextSettings);
    },
    [],
  );

  const resetPortraitGamepadLayout = React.useCallback(() => {
    const nextSettings = {
      ...getSettings(),
      native_portrait_gamepad_layout: [],
    };
    saveSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  const showNativeOptionsDialog = React.useCallback(
    async (items: Array<{id: string; title: string}>, options: any = {}) => {
      if (!NativeInputDialog?.showOptions) {
        return null;
      }

      try {
        return await NativeInputDialog.showOptions({
          items,
          ...options,
        });
      } catch (error) {
        return null;
      }
    },
    [],
  );

  const openOptionsModal = React.useCallback(async () => {
    if (optionsDialogOpenRef.current) {
      return;
    }
    if (portraitMode || isInPictureInPicture) {
      handleCloseModal();
      return;
    }

    optionsDialogOpenRef.current = true;
    GamepadManager.setCurrentScreen('');

    const items: Array<{id: string; title: string}> = [];
    if (connectState === CONNECTED) {
      items.push({
        id: 'togglePerformance',
        title: t('Toggle Performance'),
      });
      items.push({
        id: 'toggleVirtualGamepad',
        title: t('Toggle Virtual Gamepad'),
      });
      if (showVirtualGamepad) {
        items.push({
          id: 'editVirtualGamepad',
          title: t('Edit Virtual Gamepad'),
        });
      }
      if (coverAvailable) {
        items.push({
          id: 'toggleCoverControls',
          title: coverPresented
            ? t('Hide cover controls')
            : t('Show cover controls'),
        });
      }
      if (settings.enable_microphone) {
        items.push({
          id: 'toggleMicrophone',
          title: openMicro ? t('Close Microphone') : t('Open Microphone'),
        });
      }
      items.push({
        id: 'pressNexus',
        title: t('Press Nexus'),
      });
      if (route.params?.streamType !== 'cloud') {
        items.push({
          id: 'longPressNexus',
          title: t('Long press Nexus'),
        });
        items.push({
          id: 'sendText',
          title: t('Send text'),
        });
      }
      if (settings.power_on && route.params?.streamType !== 'cloud') {
        items.push({
          id: 'disconnectPowerOff',
          title: t('Disconnect and power off'),
        });
      }
    }
    items.push({
      id: 'disconnect',
      title: t('Disconnect'),
    });

    const result = await showNativeOptionsDialog(items, {
      showAudioGainControl: connectState === CONNECTED,
      audioGain,
    });
    optionsDialogOpenRef.current = false;

    if (result?.action !== 'select') {
      handleCloseModal();
      return;
    }

    handleCloseModal();

    switch (result.id) {
      case 'togglePerformance':
        setShowPerformance(!showPerformance);
        break;
      case 'toggleVirtualGamepad':
        if (showVirtualGamepad) {
          clearMacroTimers();
        }
        setShowVirtualGamepad(!showVirtualGamepad);
        break;
      case 'editVirtualGamepad':
        handleOpenGamepadEditor();
        break;
      case 'toggleCoverControls':
        if (coverPresented) {
          // Manual hide: remember it so the auto-present doesn't turn it back
          // on until the user re-enables or the device is re-opened.
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
        break;
      case 'toggleMicrophone':
        await handleToggleMic();
        break;
      case 'pressNexus':
        gpState.Nexus = 1;
        setTimeout(() => {
          gpState.Nexus = 0;
        }, 120);
        break;
      case 'longPressNexus':
        gpState.Nexus = 1;
        setTimeout(() => {
          gpState.Nexus = 0;
        }, 1000);
        break;
      case 'sendText':
        openSendTextDialog();
        break;
      case 'disconnectPowerOff':
        requestExit(true);
        break;
      case 'disconnect':
        requestExit(false);
        break;
      default:
        break;
    }
  }, [
    clearMacroTimers,
    audioGain,
    connectState,
    coverAvailable,
    coverPresented,
    handleCloseModal,
    handleOpenGamepadEditor,
    handleToggleMic,
    isInPictureInPicture,
    openMicro,
    openSendTextDialog,
    portraitMode,
    requestExit,
    route.params?.streamType,
    settings.enable_microphone,
    settings.power_on,
    showNativeOptionsDialog,
    showPerformance,
    showVirtualGamepad,
    t,
  ]);

  React.useEffect(() => {
    if (showModal) {
      openOptionsModal();
    }
  }, [openOptionsModal, showModal]);

  const renderVirtualGamepad = () => {
    if (portraitMode) {
      return null;
    }
    if (isInPictureInPicture || !showVirtualGamepad) {
      return null;
    }
    const useCustomVirtualGamepad = settings.custom_virtual_gamepad !== '';
    if (useCustomVirtualGamepad) {
      return (
        <CustomVirtualGamepad
          title={settings.custom_virtual_gamepad}
          opacity={settings.virtual_gamepad_opacity}
          joystickMode={activeJoystickMode}
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
          refreshKey={gamepadLayoutVersion}
        />
      );
    } else {
      return (
        <VirtualGamepad
          opacity={settings.virtual_gamepad_opacity}
          joystickMode={activeJoystickMode}
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
        />
      );
    }
  };

  const renderSwipeAimZone = () => {
    const sens = Number(activeSwipe.sensitivity) || 0;
    if (
      portraitMode ||
      isInPictureInPicture ||
      settings.native_touch ||
      connectState !== CONNECTED ||
      sens <= 0 ||
      activeSwipeRect.show === false
    ) {
      return null;
    }
    return (
      <SwipeAimZone
        enabled
        // Map the 0–100 slider to a per-pixel stick factor.
        sensitivity={sens * 0.0025}
        rect={{
          x: activeSwipeRect.x,
          y: activeSwipeRect.y,
          width: activeSwipeRect.width ?? 300,
          height: activeSwipeRect.height ?? 260,
        }}
        onAim={handleSwipeAim}
        onEnd={clearSwipeAim}
      />
    );
  };

  const renderPerformancePanel = () => {
    if (!portraitMode && showPerformance && !isInPictureInPicture) {
      return (
        <PerfPanel
          performance={performance}
          streamType={route.params?.streamType}
        />
      );
    } else {
      return null;
    }
  };

  const renderMenu = () => {
    if (!portraitMode && settings.show_menu && !isInPictureInPicture) {
      return (
        <View style={styles.quickMenu}>
          <IconButton
            icon="menu"
            size={28}
            onPress={() => {
              setShowModal(true);
            }}
          />
        </View>
      );
    } else {
      return null;
    }
  };

  const useFsrRenderer = !!settings.fsr;
  const fsrSharpness = settings.fsr_display_options?.sharpness ?? 2;
  const handleNativePointerInput = React.useCallback(
    (event: PointerWireData) => {
      if (!webrtcClient || !settings.native_touch) {
        return;
      }

      webrtcClient.getChannelProcessor('input')?.queuePointerInput([event]);
    },
    [settings.native_touch, webrtcClient],
  );

  const video_format = settings.native_touch ? '' : settings.video_format;
  const screen_position = settings.screen_position || 'center';
  const loadingPosterUrl =
    typeof route.params?.postUrl === 'string' ? route.params.postUrl : '';
  const showLoadingPoster = loading && !!loadingPosterUrl;
  const portraitSafeTop =
    portraitMode && Platform.OS === 'android'
      ? StatusBar.currentHeight || 0
      : 0;
  const portraitVideoHeight = Math.round((screenWidth * 9) / 16);

  const renderStreamPlayer = (containerStyle: any, playerStyle: any) => {
    if (showLoadingPoster || !remoteStream.current?.toURL()) {
      return null;
    }

    const objectFit = video_format === 'Zoom' ? 'cover' : 'contain';

    if (useFsrRenderer) {
      return (
        <View style={containerStyle}>
          <RTCFsrView
            style={playerStyle}
            zOrder={9}
            objectFit={objectFit}
            streamURL={remote}
            videoFormat={video_format || ''}
            screenPosition={screen_position}
            fsrEnabled={true}
            fsrSharpness={fsrSharpness}
          />
          <NativeTouchOverlay
            enabled={!!settings.native_touch && !isInPictureInPicture}
            videoFormat={video_format || ''}
            onPointerInput={handleNativePointerInput}
          />
        </View>
      );
    }

    return (
      <View style={containerStyle}>
        <RTCView
          style={playerStyle}
          zOrder={9}
          objectFit={objectFit}
          streamURL={remote}
          videoFormat={video_format || ''}
          screenPosition={screen_position}
        />
        <NativeTouchOverlay
          enabled={!!settings.native_touch && !isInPictureInPicture}
          videoFormat={video_format || ''}
          onPointerInput={handleNativePointerInput}
        />
      </View>
    );
  };

  const renderPortraitVirtualGamepad = () => {
    if (!portraitMode || connectState !== CONNECTED) {
      return null;
    }

    return (
      <PortraitVirtualGamepad
        layout={settings.native_portrait_gamepad_layout}
        opacity={settings.virtual_gamepad_opacity ?? 0.7}
        editing={portraitGamepadEditing}
        onEditingChange={setPortraitGamepadEditing}
        onLayoutChange={savePortraitGamepadLayout}
        onResetDefault={resetPortraitGamepadLayout}
        onPressIn={handleButtonPressIn}
        onPressOut={handleButtonPressOut}
        onStickMove={handleStickMove}
      />
    );
  };

  const confirmPortraitExit = () => {
    Alert.alert(t('Warning'), t('Exit stream?'), [
      {
        text: t('Cancel'),
        style: 'cancel',
      },
      {
        text: t('Confirm'),
        style: 'destructive',
        onPress: () => requestExit(false),
      },
    ]);
  };

  if (portraitMode) {
    return (
      <View style={styles.portraitContainer}>
        {showLoadingPoster && (
          <View style={styles.loadingPosterContainer} pointerEvents="none">
            <Image
              source={{uri: loadingPosterUrl}}
              style={styles.loadingPosterBackdrop}
              resizeMode="cover"
              blurRadius={8}
            />
            <Image
              source={{uri: loadingPosterUrl}}
              style={styles.loadingPoster}
              resizeMode="contain"
            />
            <View style={styles.loadingPosterMask} />
          </View>
        )}

        {loading && (
          <Spinner
            loading={true}
            text={loadingText}
            textStyle={
              showLoadingPoster ? styles.loadingSpinnerText : undefined
            }
            cancelable={true}
            closeCb={() => {
              setLoading(false);
              confirmPortraitExit();
            }}
          />
        )}

        <View
          style={[
            styles.portraitVideoFrame,
            {
              height: portraitVideoHeight,
              marginTop: portraitSafeTop,
            },
          ]}>
          {renderStreamPlayer(
            styles.portraitPlayerContainer,
            styles.portraitPlayer,
          )}
        </View>

        <View style={styles.portraitControls}>
          {renderPortraitVirtualGamepad()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showLoadingPoster && !isInPictureInPicture && (
        <View style={styles.loadingPosterContainer} pointerEvents="none">
          <Image
            source={{uri: loadingPosterUrl}}
            style={styles.loadingPosterBackdrop}
            resizeMode="cover"
            blurRadius={8}
          />
          <Image
            source={{uri: loadingPosterUrl}}
            style={styles.loadingPoster}
            resizeMode="contain"
          />
          <View style={styles.loadingPosterMask} />
        </View>
      )}

      {loading && !isInPictureInPicture && (
        <Spinner
          loading={true}
          text={loadingText}
          textStyle={showLoadingPoster ? styles.loadingSpinnerText : undefined}
          cancelable={true}
          closeCb={() => {
            setLoading(false);
            setShowModal(true);
          }}
        />
      )}

      {renderStreamPlayer(styles.playerContainer, styles.player)}

      {renderPerformancePanel()}

      {renderSwipeAimZone()}

      {renderVirtualGamepad()}

      <VirtualGamepadEditor
        visible={!portraitMode && showGamepadEditor && !isInPictureInPicture}
        profileName={editorProfile || getActiveProfileName()}
        profiles={gamepadProfiles}
        activeProfile={settings.custom_virtual_gamepad || ''}
        swipeSensitivity={
          getSwipeConfig(editorProfile || getActiveProfileName()).sensitivity
        }
        swipeInvertY={
          getSwipeConfig(editorProfile || getActiveProfileName()).invertY
        }
        joystickMode={
          getJoystickMode(editorProfile || getActiveProfileName()) ??
          Number(settings.virtual_gamepad_joystick)
        }
        onSave={handleSaveGamepadLayout}
        onCancel={() => setShowGamepadEditor(false)}
        onSwitchProfile={handleSwitchGamepadProfile}
        onCreateProfile={handleCreateGamepadProfile}
        onDeleteProfile={handleDeleteGamepadProfile}
      />

      {renderMenu()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingPosterContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPosterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingPosterMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  loadingPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingSpinnerText: {
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  playerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  player: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  portraitVideoFrame: {
    width: '100%',
    backgroundColor: 'black',
  },
  portraitPlayerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitPlayer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitControls: {
    flex: 1,
    backgroundColor: '#050505',
  },
  quickMenu: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    zIndex: 99,
  },
});

function NativeStreamScreen(props: NativeStreamScreenProps) {
  return <NativeStreamScreenBase {...props} />;
}

export default NativeStreamScreen;
