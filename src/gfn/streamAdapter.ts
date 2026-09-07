import {NativeModules, AppState} from 'react-native';
import BackgroundTimer from 'react-native-background-timer';
import {launchGfnSession, stopGfnSession, GfnSession} from './session';
import {GfnWebRtcClient, GfnConnectionState} from './webrtcClient';
import {getValidGfnJwt} from './auth';
import i18next from '../i18n';
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
  GAMEPAD_LS,
  GAMEPAD_RS,
  GAMEPAD_START,
  GAMEPAD_BACK,
  GAMEPAD_GUIDE,
  GAMEPAD_DPAD_UP,
  GAMEPAD_DPAD_DOWN,
  GAMEPAD_DPAD_LEFT,
  GAMEPAD_DPAD_RIGHT,
} from './inputEncoding';

// GfnStreamAdapter makes a GeForce NOW session look like the xCloud
// `webRTCClient` so NativeStream can drive it with its full UI: virtual
// gamepad, layout editor, physical/USB controllers, options menu, performance
// overlay, background handling, etc. NativeStream feeds input as an xCloud-style
// gpState; the adapter converts it to GFN's XInput packet and sends it over the
// GFN input data channels. Everything else NativeStream calls is stubbed.

// xCloud gpState button field -> GFN XInput mask.
const BUTTON_MAP: Array<[string, number]> = [
  ['A', GAMEPAD_A],
  ['B', GAMEPAD_B],
  ['X', GAMEPAD_X],
  ['Y', GAMEPAD_Y],
  ['LeftShoulder', GAMEPAD_LB],
  ['RightShoulder', GAMEPAD_RB],
  ['View', GAMEPAD_BACK],
  ['Menu', GAMEPAD_START],
  ['LeftThumb', GAMEPAD_LS],
  ['RightThumb', GAMEPAD_RS],
  ['DPadUp', GAMEPAD_DPAD_UP],
  ['DPadDown', GAMEPAD_DPAD_DOWN],
  ['DPadLeft', GAMEPAD_DPAD_LEFT],
  ['DPadRight', GAMEPAD_DPAD_RIGHT],
  ['Nexus', GAMEPAD_GUIDE],
];

const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);

// Convert an xCloud gpState object into a GFN XInput GamepadInput.
export const gpStateToGfnInput = (gp: any): GamepadInput => {
  let buttons = 0;
  for (const [key, mask] of BUTTON_MAP) {
    if (gp?.[key]) {
      buttons |= mask;
    }
  }
  return {
    controllerId: 0,
    buttons,
    leftTrigger: normalizeTriggerToUint8(num(gp?.LeftTrigger)),
    rightTrigger: normalizeTriggerToUint8(num(gp?.RightTrigger)),
    leftStickX: normalizeAxisToInt16(num(gp?.LeftThumbXAxis)),
    // xCloud on-screen/native sticks are screen-down positive; GFN XInput wants
    // up positive, so invert Y.
    leftStickY: normalizeAxisToInt16(-num(gp?.LeftThumbYAxis)),
    rightStickX: normalizeAxisToInt16(num(gp?.RightThumbXAxis)),
    rightStickY: normalizeAxisToInt16(-num(gp?.RightThumbYAxis)),
  };
};

// NativeStream connection-state literals.
const CONNECTED = 'connected';
const CLOSED = 'closed';
const FAILED = 'failed';

const {StreamKeepAliveManager} = NativeModules;
const {t} = i18next;

type AdapterOptions = {
  appId: string;
  title: string;
  // Loading/queue progress text for the connecting overlay.
  onProgress?: (text: string) => void;
};

export class GfnStreamAdapter {
  private gfnClient: GfnWebRtcClient | null = null;
  private session: GfnSession | null = null;
  private token: string | null = null;
  private disposed = false;
  private cancelled = false;
  private pollRate = 60;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private gpState: any = null;

  // Handlers NativeStream registers.
  private trackHandler: ((event: any) => void) | null = null;
  private connectedHandler: ((state: string) => void) | null = null;

  // Queue-phase background keep-alive (foreground service + notification) so the
  // wait survives backgrounding and shows the live queue position. Once
  // connected, NativeStream owns the streaming keep-alive.
  private keepAlive = false;
  private keepAliveText = '';
  private appState: string = AppState.currentState ?? 'active';
  private appStateSub: any = null;

  constructor(private readonly options: AdapterOptions) {
    this.appStateSub = AppState.addEventListener('change', next => {
      this.appState = next;
      // Back in the foreground: drop any pending "seat ready" notification.
      if (next === 'active') {
        StreamKeepAliveManager?.cancelReady?.();
      }
    });
  }

  // Start/refresh the queue keep-alive notification. Android forbids starting a
  // foreground service from the background, so this must first run while
  // foreground (during the queue); later text updates are background-safe.
  private showKeepAlive(text: string): void {
    if (this.keepAliveText === text && this.keepAlive) {
      return;
    }
    this.keepAliveText = text;
    if (!this.keepAlive) {
      this.keepAlive = true;
      StreamKeepAliveManager?.start?.(
        this.options.title,
        text,
        t('Disconnect'),
        0,
      );
    } else {
      StreamKeepAliveManager?.update?.(
        this.options.title,
        text,
        t('Disconnect'),
      );
    }
  }

  private stopKeepAlive(): void {
    StreamKeepAliveManager?.cancelReady?.();
    this.keepAliveText = '';
    if (this.keepAlive) {
      this.keepAlive = false;
      StreamKeepAliveManager?.stop?.();
    }
  }

  // Background-safe sleep so the queue poll keeps firing while backgrounded.
  private bgSleep(ms: number): Promise<void> {
    return new Promise<void>(resolve =>
      BackgroundTimer.setTimeout(resolve, ms),
    );
  }

  // ---- lifecycle NativeStream calls ----

  init(): void {
    // Kick off the GFN launch + connect. Reports queue progress via onProgress
    // and drives NativeStream's connected handler on state changes.
    void this.launch();
  }

  private async launch(): Promise<void> {
    try {
      const token = await getValidGfnJwt();
      if (!token) {
        this.connectedHandler?.(FAILED);
        return;
      }
      this.token = token;
      const session = await launchGfnSession(this.options.appId, token, {
        shouldCancel: () => this.cancelled,
        sleep: ms => this.bgSleep(ms),
        onProgress: p => {
          if (this.disposed) {
            return;
          }
          if (p.status === 1) {
            // Entered setup/queue: keep the process alive so the wait survives
            // backgrounding, and show the live position in the notification
            // (updates in place as the queue advances).
            const n = p.queuePosition ?? 0;
            const queued = n > 1;
            this.showKeepAlive(
              queued
                ? t('GfnQueueNotifyPosition', {n})
                : t('GfnQueueKeepAlive'),
            );
            this.options.onProgress?.(
              queued ? t('GfnLaunchQueued', {n}) : t('GfnLaunchStarting'),
            );
          }
        },
      });
      if (this.disposed || this.cancelled) {
        stopGfnSession(session, token);
        return;
      }
      this.session = session;

      // Seat is ready. If the user backgrounded during the queue, alert them.
      if (this.appState !== 'active') {
        StreamKeepAliveManager?.notifyReady?.(
          this.options.title,
          t('GfnReadyNotifyBody'),
        );
      }

      const client = new GfnWebRtcClient(session, {
        onStream: stream => {
          if (this.disposed) {
            return;
          }
          // Feed each track into NativeStream's remoteStream.
          const tracks = stream.getTracks?.() ?? [];
          tracks.forEach((track: any) => this.trackHandler?.({track}));
        },
        onState: (s: GfnConnectionState, detail?: string) => {
          if (this.disposed) {
            return;
          }
          if (s === 'connected') {
            // Streaming has begun; the queue keep-alive is no longer needed —
            // NativeStream owns the in-stream keep-alive from here.
            this.stopKeepAlive();
            this.startInputLoop();
            this.connectedHandler?.(CONNECTED);
          } else if (s === 'failed') {
            this.stopKeepAlive();
            this.connectedHandler?.(FAILED);
          } else if (s === 'disconnected') {
            this.stopKeepAlive();
            this.connectedHandler?.(CLOSED);
          } else {
            this.options.onProgress?.(detail || s);
          }
        },
      });
      this.gfnClient = client;
      client.connect();
    } catch (e: any) {
      this.stopKeepAlive();
      if (!this.disposed && e?.message !== 'cancelled') {
        this.connectedHandler?.(FAILED);
      }
    }
  }

  private startInputLoop(): void {
    if (this.inputTimer) {
      return;
    }
    const intervalMs = Math.max(4, Math.round(1000 / (this.pollRate || 60)));
    this.inputTimer = setInterval(() => {
      if (this.gpState && this.gfnClient) {
        this.gfnClient.sendGamepad(gpStateToGfnInput(this.gpState));
      }
    }, intervalMs);
  }

  private stopInputLoop(): void {
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = null;
    }
  }

  close(): void {
    this.disposed = true;
    this.cancelled = true;
    this.stopInputLoop();
    this.stopKeepAlive();
    if (this.appStateSub) {
      this.appStateSub.remove?.();
      this.appStateSub = null;
    }
    this.gfnClient?.dispose();
    this.gfnClient = null;
    if (this.session && this.token) {
      stopGfnSession(this.session, this.token);
      this.session = null;
    }
  }

  // ---- input NativeStream calls ----

  setGamepadState(gpState: any): void {
    this.gpState = gpState;
    // Also send immediately for lowest latency (the loop resends periodically).
    if (this.gfnClient) {
      this.gfnClient.sendGamepad(gpStateToGfnInput(gpState));
    }
  }

  setPollRate(value: number): void {
    if (typeof value === 'number' && value > 0) {
      this.pollRate = value;
      if (this.inputTimer) {
        this.stopInputLoop();
        this.startInputLoop();
      }
    }
  }

  getChannelProcessor(name: string): any {
    if (name === 'input') {
      return {
        queueGamepadState: (frame: any) => {
          this.gfnClient?.sendGamepad(gpStateToGfnInput(frame));
        },
        queueGamepadStates: (frames: any[]) => {
          frames?.forEach(f =>
            this.gfnClient?.sendGamepad(gpStateToGfnInput(f)),
          );
        },
        flushGamepadInput: () => {},
        // xCloud anti-idle / resolution-stability frames and touch pointer
        // input have no GFN equivalent here — accept and drop them.
        addProcessedFrame: () => {},
        queuePointerInput: () => {},
      };
    }
    if (name === 'chat') {
      // GFN mic is not wired up; report "not paused" so the mic toggle takes
      // the stop path (no "failed to open microphone" alert).
      return {
        isPaused: false,
        startMic: () => Promise.resolve(false),
        stopMic: () => {},
        send: () => {},
      };
    }
    // Control / other channels are not used on GFN.
    return {
      queueGamepadState: () => {},
      flushGamepadInput: () => {},
      send: () => {},
    };
  }

  // ---- handler setters NativeStream calls ----

  setTrackHandler(listener: any): void {
    this.trackHandler = listener;
  }
  setConnectedHandler(listener: any): void {
    this.connectedHandler = listener;
  }

  // No-ops: xCloud-specific features GFN doesn't use.
  setSdpHandler(): void {}
  setSystemUiHandler(): void {}
  setMessageHandler(): void {}
  setMaxTouchPoints(): void {}
  setSupportedSystemUis(): void {}
  setCoop(): void {}
  setRumbleHandler(): void {}

  // ---- stats NativeStream calls for the perf overlay ----

  getAudioVolume(): Promise<number> {
    return Promise.resolve(0);
  }

  getStreamState(): Promise<any> {
    return Promise.resolve({
      resolution: '',
      rtt: '-1 (-1%)',
      jit: '-1',
      fps: 0,
      pl: '-1 (-1%)',
      fl: '-1 (-1%)',
      br: '',
      decode: '',
    });
  }
}
