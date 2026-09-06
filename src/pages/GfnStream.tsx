import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
  AppState,
  NativeModules,
} from 'react-native';
import {Text} from 'react-native-paper';
import {RTCView, MediaStream} from 'react-native-webrtc';
import BackgroundTimer from 'react-native-background-timer';
import {useTranslation} from 'react-i18next';
import AnalogStick from '../components/AnalogStick';
import {getValidGfnJwt} from '../gfn/auth';
import {launchGfnSession, stopGfnSession, GfnSession} from '../gfn/session';
import {GfnWebRtcClient, GfnConnectionState} from '../gfn/webrtcClient';
import {
  GamepadInput,
  normalizeAxisToInt16,
  normalizeTriggerToUint8,
  GAMEPAD_A,
  GAMEPAD_B,
  GAMEPAD_X,
  GAMEPAD_Y,
  GAMEPAD_LB,
  GAMEPAD_RB,
  GAMEPAD_START,
  GAMEPAD_BACK,
  GAMEPAD_GUIDE,
  GAMEPAD_DPAD_UP,
  GAMEPAD_DPAD_DOWN,
  GAMEPAD_DPAD_LEFT,
  GAMEPAD_DPAD_RIGHT,
} from '../gfn/inputEncoding';

const {StreamKeepAliveManager} = NativeModules;
const ACCENT = '#76B900';

// GeForce NOW streaming screen: launches a CloudMatch session for the given app
// id, connects the WebRTC client, renders the remote video, and drives it with
// an on-screen gamepad. Route params: {appId, title}.
function GfnStreamScreen({route, navigation}: any) {
  const {t} = useTranslation();
  const appId: string = route?.params?.appId;
  const title: string = route?.params?.title ?? 'GeForce NOW';

  const [streamUrl, setStreamUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<GfnConnectionState>('connecting');
  const [statusText, setStatusText] = React.useState<string>(t('Loading...'));
  const [fatal, setFatal] = React.useState<string | null>(null);

  const clientRef = React.useRef<GfnWebRtcClient | null>(null);
  const sessionRef = React.useRef<GfnSession | null>(null);
  const tokenRef = React.useRef<string | null>(null);
  const cancelledRef = React.useRef(false);
  const appStateRef = React.useRef(AppState.currentState);
  const keepAliveRef = React.useRef(false);
  const keepAliveTextRef = React.useRef<string>('');

  // Keep the process alive while queuing so polling survives backgrounding, and
  // reflect the live queue position in the ongoing notification. The service is
  // started while the app is foreground (Android forbids starting a foreground
  // service from the background); later text changes update the notification in
  // place (safe from the background).
  const showKeepAlive = React.useCallback(
    (text: string) => {
      if (keepAliveTextRef.current === text && keepAliveRef.current) {
        return;
      }
      keepAliveTextRef.current = text;
      if (!keepAliveRef.current) {
        keepAliveRef.current = true;
        StreamKeepAliveManager?.start?.(title, text, t('Disconnect'), 0);
      } else {
        StreamKeepAliveManager?.update?.(title, text, t('Disconnect'));
      }
    },
    [title, t],
  );

  const stopKeepAlive = React.useCallback(() => {
    StreamKeepAliveManager?.cancelReady?.();
    keepAliveTextRef.current = '';
    if (keepAliveRef.current) {
      keepAliveRef.current = false;
      StreamKeepAliveManager?.stop?.();
    }
  }, []);

  // Background-safe sleep so the queue poll keeps firing when backgrounded.
  const bgSleep = React.useCallback(
    (ms: number) =>
      new Promise<void>(resolve => BackgroundTimer.setTimeout(resolve, ms)),
    [],
  );

  // The live controller state, mutated in place and sent on every change.
  const gp = React.useRef<GamepadInput>({
    controllerId: 0,
    buttons: 0,
    leftTrigger: 0,
    rightTrigger: 0,
    leftStickX: 0,
    leftStickY: 0,
    rightStickX: 0,
    rightStickY: 0,
  });

  const sendGamepad = React.useCallback(() => {
    clientRef.current?.sendGamepad(gp.current);
  }, []);

  const setButton = React.useCallback(
    (mask: number, down: boolean) => {
      if (down) {
        gp.current.buttons |= mask;
      } else {
        gp.current.buttons &= ~mask;
      }
      sendGamepad();
    },
    [sendGamepad],
  );

  const setTrigger = React.useCallback(
    (side: 'left' | 'right', down: boolean) => {
      const value = down ? normalizeTriggerToUint8(1) : 0;
      if (side === 'left') {
        gp.current.leftTrigger = value;
      } else {
        gp.current.rightTrigger = value;
      }
      sendGamepad();
    },
    [sendGamepad],
  );

  const setStick = React.useCallback(
    (side: 'left' | 'right', x: number, y: number) => {
      const ix = normalizeAxisToInt16(x);
      // XInput convention: stick up is positive, screen-down is positive -> invert.
      const iy = normalizeAxisToInt16(-y);
      if (side === 'left') {
        gp.current.leftStickX = ix;
        gp.current.leftStickY = iy;
      } else {
        gp.current.rightStickX = ix;
        gp.current.rightStickY = iy;
      }
      sendGamepad();
    },
    [sendGamepad],
  );

  const cleanup = React.useCallback(() => {
    cancelledRef.current = true;
    stopKeepAlive();
    clientRef.current?.dispose();
    clientRef.current = null;
    if (sessionRef.current && tokenRef.current) {
      stopGfnSession(sessionRef.current, tokenRef.current);
      sessionRef.current = null;
    }
  }, [stopKeepAlive]);

  const exit = React.useCallback(() => {
    cleanup();
    navigation.goBack();
  }, [cleanup, navigation]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!appId || !/^\d+$/.test(appId)) {
        setFatal(t('GfnLaunchInvalidApp'));
        return;
      }
      const token = await getValidGfnJwt();
      if (!token) {
        setFatal(t('GfnLaunchSignInRequired'));
        return;
      }
      tokenRef.current = token;
      try {
        setStatusText(t('GfnLaunchRequesting'));
        const session = await launchGfnSession(appId, token, {
          shouldCancel: () => cancelledRef.current,
          sleep: bgSleep,
          onProgress: p => {
            if (!active) {
              return;
            }
            if (p.status === 1) {
              // Entered setup/queue: keep the process alive so the wait
              // survives backgrounding, and show the live position in the
              // notification (updates as the queue advances).
              const n = p.queuePosition ?? 0;
              const queued = n > 1;
              showKeepAlive(
                queued
                  ? t('GfnQueueNotifyPosition', {n})
                  : t('GfnQueueKeepAlive'),
              );
              setStatusText(
                queued ? t('GfnLaunchQueued', {n}) : t('GfnLaunchStarting'),
              );
            }
          },
        });
        if (!active || cancelledRef.current) {
          stopGfnSession(session, token);
          return;
        }
        sessionRef.current = session;
        setStatusText(t('GfnLaunchConnecting'));
        // Seat is ready. If the user backgrounded during the queue, alert them.
        if (appStateRef.current !== 'active') {
          StreamKeepAliveManager?.notifyReady?.(title, t('GfnReadyNotifyBody'));
        }

        const client = new GfnWebRtcClient(session, {
          onStream: stream => {
            if (active) {
              setStreamUrl((stream as MediaStream).toURL());
            }
          },
          onState: (s, detail) => {
            if (!active) {
              return;
            }
            setState(s);
            if (s === 'connected') {
              setStatusText('');
              // Streaming has begun; the queue keep-alive is no longer needed.
              stopKeepAlive();
            } else if (s === 'failed') {
              setFatal(detail || t('GfnLaunchFailed'));
              stopKeepAlive();
            } else if (s === 'disconnected') {
              setFatal(detail || t('GfnLaunchDisconnected'));
              stopKeepAlive();
            }
          },
        });
        clientRef.current = client;
        client.connect();
      } catch (e: any) {
        stopKeepAlive();
        if (active && e?.message !== 'cancelled') {
          setFatal(e?.message || t('GfnLaunchFailed'));
        }
      }
    })();

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    const appSub = AppState.addEventListener('change', next => {
      appStateRef.current = next;
      // Coming back to the foreground: clear any pending ready notification.
      if (next === 'active') {
        StreamKeepAliveManager?.cancelReady?.();
      }
    });

    return () => {
      active = false;
      backSub.remove();
      appSub.remove();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = state === 'connected' && !!streamUrl;

  return (
    <View style={styles.root}>
      {streamUrl ? (
        <RTCView
          style={styles.video}
          objectFit="contain"
          streamURL={streamUrl}
        />
      ) : (
        <View style={styles.video} />
      )}

      {!connected && (
        <View style={styles.overlay} pointerEvents="box-none">
          {fatal ? (
            <View style={styles.centre}>
              <Text style={styles.fatalText}>{fatal}</Text>
              <Pressable style={styles.exitBtn} onPress={exit}>
                <Text style={styles.exitBtnText}>{t('Back')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.centre}>
              <ActivityIndicator color={ACCENT} size="large" />
              <Text style={styles.statusText}>{statusText}</Text>
              <Text style={styles.titleText}>{title}</Text>
              <Pressable style={styles.exitBtn} onPress={exit}>
                <Text style={styles.exitBtnText}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {connected && (
        <View style={styles.controls} pointerEvents="box-none">
          {/* Left analog stick */}
          <View style={[styles.stickWrap, styles.leftStick]}>
            <AnalogStick
              radius={70}
              handleRadius={38}
              style={styles.stick}
              onStickChange={(d: any) => setStick('left', d.x, d.y)}
            />
          </View>
          {/* Right analog stick */}
          <View style={[styles.stickWrap, styles.rightStick]}>
            <AnalogStick
              radius={70}
              handleRadius={38}
              style={styles.stick}
              onStickChange={(d: any) => setStick('right', d.x, d.y)}
            />
          </View>

          {/* Face buttons */}
          <View style={styles.faceCluster}>
            <PadButton
              label="Y"
              style={styles.faceY}
              mask={GAMEPAD_Y}
              onBtn={setButton}
            />
            <PadButton
              label="X"
              style={styles.faceX}
              mask={GAMEPAD_X}
              onBtn={setButton}
            />
            <PadButton
              label="B"
              style={styles.faceB}
              mask={GAMEPAD_B}
              onBtn={setButton}
            />
            <PadButton
              label="A"
              style={styles.faceA}
              mask={GAMEPAD_A}
              onBtn={setButton}
            />
          </View>

          {/* D-pad */}
          <View style={styles.dpadCluster}>
            <PadButton
              label="▲"
              style={styles.dUp}
              mask={GAMEPAD_DPAD_UP}
              onBtn={setButton}
            />
            <PadButton
              label="◀"
              style={styles.dLeft}
              mask={GAMEPAD_DPAD_LEFT}
              onBtn={setButton}
            />
            <PadButton
              label="▶"
              style={styles.dRight}
              mask={GAMEPAD_DPAD_RIGHT}
              onBtn={setButton}
            />
            <PadButton
              label="▼"
              style={styles.dDown}
              mask={GAMEPAD_DPAD_DOWN}
              onBtn={setButton}
            />
          </View>

          {/* Shoulders + triggers */}
          <PadButton
            label="LB"
            style={styles.lb}
            mask={GAMEPAD_LB}
            onBtn={setButton}
          />
          <PadButton
            label="RB"
            style={styles.rb}
            mask={GAMEPAD_RB}
            onBtn={setButton}
          />
          <TriggerButton
            label="LT"
            style={styles.lt}
            side="left"
            onTrig={setTrigger}
          />
          <TriggerButton
            label="RT"
            style={styles.rt}
            side="right"
            onTrig={setTrigger}
          />

          {/* Center buttons */}
          <PadButton
            label="⊟"
            style={styles.back}
            mask={GAMEPAD_BACK}
            onBtn={setButton}
          />
          <PadButton
            label="≡"
            style={styles.start}
            mask={GAMEPAD_START}
            onBtn={setButton}
          />
          <PadButton
            label="⊕"
            style={styles.guide}
            mask={GAMEPAD_GUIDE}
            onBtn={setButton}
          />

          {/* Exit */}
          <Pressable style={styles.streamExit} onPress={exit}>
            <Text style={styles.streamExitText}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const PadButton = ({label, style, mask, onBtn}: any) => (
  <Pressable
    style={[styles.padBtn, style]}
    onPressIn={() => onBtn(mask, true)}
    onPressOut={() => onBtn(mask, false)}>
    <Text style={styles.padBtnText}>{label}</Text>
  </Pressable>
);

const TriggerButton = ({label, style, side, onTrig}: any) => (
  <Pressable
    style={[styles.padBtn, style]}
    onPressIn={() => onTrig(side, true)}
    onPressOut={() => onTrig(side, false)}>
    <Text style={styles.padBtnText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  video: {flex: 1, backgroundColor: '#000'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centre: {alignItems: 'center', gap: 14, padding: 24},
  statusText: {color: '#E6ECE8', fontSize: 15, fontWeight: '600'},
  titleText: {color: '#8A9A92', fontSize: 13},
  fatalText: {
    color: '#E6ECE8',
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 320,
  },
  exitBtn: {
    marginTop: 6,
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ACCENT,
  },
  exitBtnText: {color: ACCENT, fontWeight: '800', fontSize: 14},
  controls: {...StyleSheet.absoluteFillObject},
  stickWrap: {
    position: 'absolute',
    bottom: 24,
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftStick: {left: 20},
  rightStick: {right: 20},
  stick: {width: 160, height: 160},
  faceCluster: {
    position: 'absolute',
    right: 190,
    bottom: 40,
    width: 150,
    height: 150,
  },
  dpadCluster: {
    position: 'absolute',
    left: 190,
    bottom: 40,
    width: 150,
    height: 150,
  },
  padBtn: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,26,22,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(118,185,0,0.5)',
  },
  padBtnText: {color: '#E6ECE8', fontSize: 16, fontWeight: '800'},
  faceA: {left: 49, top: 98, borderColor: 'rgba(120,200,80,0.8)'},
  faceB: {left: 98, top: 49, borderColor: 'rgba(220,80,80,0.8)'},
  faceX: {left: 0, top: 49, borderColor: 'rgba(80,140,220,0.8)'},
  faceY: {left: 49, top: 0, borderColor: 'rgba(220,200,80,0.8)'},
  dUp: {left: 49, top: 0},
  dLeft: {left: 0, top: 49},
  dRight: {left: 98, top: 49},
  dDown: {left: 49, top: 98},
  lb: {left: 30, top: 20},
  rb: {right: 30, top: 20, left: undefined},
  lt: {left: 90, top: 20},
  rt: {right: 90, top: 20, left: undefined},
  back: {alignSelf: 'center', left: '42%', top: 24},
  start: {alignSelf: 'center', left: '54%', top: 24},
  guide: {alignSelf: 'center', left: '48%', top: 84},
  streamExit: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  streamExitText: {color: '#fff', fontSize: 18, fontWeight: '700'},
});

export default GfnStreamScreen;
