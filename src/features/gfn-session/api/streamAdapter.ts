import {NativeModules, AppState} from 'react-native';
import BackgroundTimer from 'react-native-background-timer';
import {
  launchGfnSession,
  stopGfnSession,
  GfnSession,
  GfnStreamSettings,
  DEFAULT_GFN_SETTINGS,
} from './session';
import {estimateQueueEtaMinutes} from './queueStatus';
import {GfnWebRtcClient} from '../lib/webrtcClient';
import type {GfnConnectionState} from '../lib/webrtcClient';
import {GfnNativeWebRtcClient} from '../lib/nativeWebRtcClient';
import {getValidGfnJwt} from '../../../entities/gfn-account';
import {getSettings} from '../../../shared/lib/settings';
import i18next from '../../../i18n';
import type {LoadingPhase} from '../../../shared/lib/loadingPhase';
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
} from '../../../entities/gfn-input';
import {GfnTouchGestureTracker} from '../lib/touchGesture';

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

// Shorten a CloudMatch base URL to a short region label for the performance
// overlay, e.g. "https://jp-01.cloudmatchbeta.nvidiagrid.net" -> "jp-01", or
// "default" when it's still the global (unresolved-region) endpoint — the
// tell-tale sign region discovery fell back instead of finding the local one.
const regionLabelFromBase = (base?: string): string => {
  if (!base) {
    return '';
  }
  const host = base.replace(/^https?:\/\//, '').split('/')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return host;
  }
  const zoneMatch = /^([a-z0-9-]+)\.cloudmatchbeta\.nvidiagrid\.net$/i.exec(
    host,
  );
  if (zoneMatch) {
    return zoneMatch[1] === 'prod' ? 'default' : zoneMatch[1];
  }
  return host;
};

// Build the GfnStreamSettings CloudMatch/nvstSdp are driven by from the
// user's saved GFN quality settings. Codec is left at the default
// (H264) — it isn't exposed as a user setting since it's the only codec
// verified to negotiate reliably on RN.
const readGfnStreamSettings = (): GfnStreamSettings => {
  const s = getSettings();
  const resolution =
    typeof s.gfn_resolution === 'string' && s.gfn_resolution
      ? s.gfn_resolution
      : DEFAULT_GFN_SETTINGS.resolution;
  const fps =
    typeof s.gfn_fps === 'number' && s.gfn_fps > 0
      ? s.gfn_fps
      : DEFAULT_GFN_SETTINGS.fps;
  const maxBitrateMbps =
    s.gfn_bitrate_mode === 'custom' &&
    typeof s.gfn_bitrate === 'number' &&
    s.gfn_bitrate > 0
      ? s.gfn_bitrate
      : DEFAULT_GFN_SETTINGS.maxBitrateMbps;
  return {
    resolution,
    fps,
    maxBitrateMbps,
    codec: DEFAULT_GFN_SETTINGS.codec,
  };
};

// NativeStream connection-state literals.
const CONNECTED = 'connected';
const CLOSED = 'closed';
const FAILED = 'failed';

// Grace period before a WebRTC 'disconnected' report is treated as a real
// close -- see the 'disconnected' branch in launch()'s onState for why.
const DISCONNECT_GRACE_MS = 8000;

const {StreamKeepAliveManager} = NativeModules;
const {t} = i18next;

type AdapterOptions = {
  appId: string;
  title: string;
  // Loading/queue progress for the connecting overlay: the raw detail text
  // (unchanged, shown verbatim in the overlay's telemetry line) plus which
  // phase of the shared ladder it corresponds to, and a queue position when
  // phase is 'queue'.
  onProgress?: (
    text: string,
    phase?: LoadingPhase,
    queuePosition?: number,
  ) => void;
};

export class GfnStreamAdapter {
  // The Kotlin-native client is the default; gfn_native_webrtc=false falls
  // back to the original JS one as an escape hatch (see that setting's own
  // description). Both share the same call shape by design -- except
  // setRemoteAudioVolume, native-only, guarded with optional chaining below.
  private gfnClient: GfnNativeWebRtcClient | GfnWebRtcClient | null = null;
  // Id of the current remote video track in NativeVideoTrackHolder, once
  // GfnWebRtcTrackReady reports one -- fed to RTCFsrView's nativeTrackId
  // prop via trackHandler (see setTrackHandler below).
  private _videoTrackId: string | null = null;
  private session: GfnSession | null = null;
  private token: string | null = null;
  private disposed = false;
  private cancelled = false;
  private pollRate = 60;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private gpState: any = null;
  // Previous inbound-video stat sample, for bitrate/jitter/decode deltas.
  private lastStat: any = null;
  // Pending "treat the transient 'disconnected' report as a real close"
  // timer, and the most recent reason text reported while it's pending --
  // see onState's 'disconnected' branch.
  private disconnectGraceTimer: any = null;
  private disconnectGraceDetail: string | undefined;

  // Handlers NativeStream registers.
  private trackHandler: ((event: any) => void) | null = null;
  private connectedHandler: ((state: string, detail?: string) => void) | null =
    null;

  // Queue-phase background keep-alive (foreground service + notification) so the
  // wait survives backgrounding and shows the live queue position. Once
  // connected, NativeStream owns the streaming keep-alive.
  private keepAlive = false;
  private keepAliveText = '';
  private appState: string = AppState.currentState ?? 'active';
  private appStateSub: any = null;

  // Disambiguates single- vs two-finger gestures for the absolute-touch
  // input path (native touch mode) -- see touchGesture.ts and
  // getChannelProcessor('input')'s queuePointerInput below.
  private readonly touchGesture = new GfnTouchGestureTracker({
    moveCursor: (x, y, warp) => this.gfnClient?.sendMouseAbsolute(x, y, warp),
    buttonDown: button => this.gfnClient?.sendMouseButtonDown(button),
    buttonUp: button => this.gfnClient?.sendMouseButtonUp(button),
    wheel: delta => this.gfnClient?.sendMouseWheel(delta),
  });

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

  // Stops the queue/setup keep-alive notification. Deliberately does NOT
  // also cancel the separate "seat ready" notification (notifyReady) --
  // that one is meant to survive until the user actually comes back to the
  // app (the AppState listener above cancels it then) or taps it
  // (setAutoCancel, native side). This used to cancel it here too, which
  // fired the instant the connection succeeded in the background -- often
  // within a couple of seconds of notifyReady, before the user had any
  // real chance to see it, let alone act on it. Call cancelReady()
  // explicitly at call sites where the session is actually ending instead.
  private stopKeepAlive(): void {
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

  private clearDisconnectGrace(): void {
    if (this.disconnectGraceTimer) {
      BackgroundTimer.clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
    this.disconnectGraceDetail = undefined;
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
        this.connectedHandler?.(
          FAILED,
          'Sign-in required or token refresh failed',
        );
        return;
      }
      this.token = token;
      const session = await launchGfnSession(this.options.appId, token, {
        settings: readGfnStreamSettings(),
        regionOverrideUrl: getSettings().gfn_region || undefined,
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
                ? t('GfnQueueNotifyPosition', {
                    n,
                    minutes: estimateQueueEtaMinutes(n),
                  })
                : t('GfnQueueKeepAlive'),
            );
            this.options.onProgress?.(
              queued ? t('GfnLaunchQueued', {n}) : t('GfnLaunchStarting'),
              queued ? 'queue' : 'handshake',
              queued ? n : undefined,
            );
          }
        },
      });
      if (this.disposed || this.cancelled) {
        stopGfnSession(session, token);
        return;
      }
      this.session = session;

      // Show which CloudMatch region the session actually landed on as soon
      // as it's known, so it's visible during connection setup itself — not
      // only in the (opt-in) performance overlay once already playing.
      const region = regionLabelFromBase(session.streamingBaseUrl);
      if (region) {
        this.options.onProgress?.(
          t('GfnConnectingRegion', {region}),
          'starting',
        );
      }

      // Seat is ready. If the user backgrounded during the queue, alert them.
      if (this.appState !== 'active') {
        StreamKeepAliveManager?.notifyReady?.(
          this.options.title,
          t('GfnReadyNotifyBody'),
        );
      }

      const onState = (s: GfnConnectionState, detail?: string) => {
        if (this.disposed) {
          return;
        }
        if (s === 'connected') {
          // A real recovery (or the first connect) -- drop any pending
          // disconnect-grace timer from a transient blip that healed on its
          // own, then proceed as normal.
          this.clearDisconnectGrace();
          // Streaming has begun; the queue keep-alive is no longer needed —
          // NativeStream owns the in-stream keep-alive from here.
          this.stopKeepAlive();
          this.startInputLoop();
          this.connectedHandler?.(CONNECTED);
        } else if (s === 'failed') {
          // 'failed' is already a terminal ICE/peer-connection state (unlike
          // 'disconnected' below) -- no point waiting out the grace period.
          this.clearDisconnectGrace();
          this.stopKeepAlive();
          StreamKeepAliveManager?.cancelReady?.();
          this.connectedHandler?.(FAILED, detail || s);
        } else if (s === 'disconnected') {
          // WebRTC's 'disconnected' peer/ICE state is explicitly transient
          // by spec -- a brief network path change, or a background radio
          // going idle for a moment, commonly trips it, and the connection
          // often recovers back to 'connected' on its own within a few
          // seconds. Treating it as an immediate hard close (as this used
          // to) was most likely to fire exactly when a user backgrounded
          // the app right as GFN's queue finished (see notifyReady above) --
          // precisely when a brief connectivity hiccup is common -- closing
          // the stream screen before they ever got back to tap the "seat
          // ready" notification, landing them back on the Library screen
          // with no way to resume. Give it a grace period to self-heal
          // before treating it as a real disconnect; 'connected' (above)
          // cancels this if it recovers in time.
          //
          // Keep refreshing the reason text on every repeated 'disconnected'
          // report while the timer is already pending, without restarting
          // the timer itself -- so a stale reason from the *first* blip
          // doesn't outlive a more specific one reported moments later,
          // while the grace window stays a fixed, bounded wait either way.
          this.disconnectGraceDetail = detail || s;
          if (!this.disconnectGraceTimer) {
            this.disconnectGraceTimer = BackgroundTimer.setTimeout(() => {
              this.disconnectGraceTimer = null;
              if (this.disposed) {
                return;
              }
              this.stopKeepAlive();
              StreamKeepAliveManager?.cancelReady?.();
              this.connectedHandler?.(CLOSED, this.disconnectGraceDetail);
            }, DISCONNECT_GRACE_MS);
          }
        } else {
          this.clearDisconnectGrace();
          const region = regionLabelFromBase(this.session?.streamingBaseUrl);
          const phase: LoadingPhase =
            s === 'negotiating' || s === 'signaling'
              ? 'negotiating'
              : 'starting';
          this.options.onProgress?.(
            region ? `${detail || s} (${region})` : detail || s,
            phase,
          );
        }
      };

      // Escape hatch back to the original JS WebRTC client if the
      // Kotlin-native one misbehaves on a given device (see the
      // 'gfn_native_webrtc' setting's own description).
      if (getSettings().gfn_native_webrtc !== false) {
        const client = new GfnNativeWebRtcClient(session, {
          onTrack: (kind, trackId) => {
            if (this.disposed) {
              return;
            }
            if (kind === 'video') {
              // Audio needs no view -- it plays automatically through the
              // native PeerConnectionFactory's JavaAudioDeviceModule. kind
              // must be included here even though this branch already only
              // ever fires for 'video' -- NativeStream's setTrackHandler
              // callback (native-stream/index.tsx) checks event.kind itself
              // now (to tell GFN's and xCloud's video/audio events apart),
              // and an event with trackId but no kind fails that check.
              this._videoTrackId = trackId;
              this.trackHandler?.({trackId, kind});
            }
          },
          onState,
        });
        this.gfnClient = client;
        client.connect();
      } else {
        const client = new GfnWebRtcClient(session, {
          onStream: stream => {
            if (this.disposed) {
              return;
            }
            // Feed each track into NativeStream's remoteStream.
            const tracks = stream.getTracks?.() ?? [];
            tracks.forEach((track: any) => this.trackHandler?.({track}));
          },
          onState,
        });
        this.gfnClient = client;
        client.connect();
      }
    } catch (e: any) {
      this.stopKeepAlive();
      StreamKeepAliveManager?.cancelReady?.();
      if (!this.disposed && e?.message !== 'cancelled') {
        this.connectedHandler?.(
          FAILED,
          e?.message ? String(e.message) : String(e),
        );
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
    this.clearDisconnectGrace();
    this.stopInputLoop();
    this.stopKeepAlive();
    StreamKeepAliveManager?.cancelReady?.();
    this.touchGesture.dispose();
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
        queueMouseMove: (dx: number, dy: number) => {
          this.gfnClient?.sendMouseMove(dx, dy);
        },
        sendMouseButtonDown: (button: number) => {
          this.gfnClient?.sendMouseButtonDown(button);
        },
        sendMouseButtonUp: (button: number) => {
          this.gfnClient?.sendMouseButtonUp(button);
        },
        queueMouseWheel: (delta: number, horizontal = 0) => {
          this.gfnClient?.sendMouseWheel(delta, horizontal);
        },
        sendKeyDown: (virtualKey: number, modifiers: number) => {
          this.gfnClient?.sendKeyDown(virtualKey, modifiers);
        },
        sendKeyUp: (virtualKey: number, modifiers: number) => {
          this.gfnClient?.sendKeyUp(virtualKey, modifiers);
        },
        // xCloud anti-idle / resolution-stability frames have no GFN
        // equivalent — accept and drop them.
        addProcessedFrame: () => {},
        // GFN has no native multi-touch wire format, but NVST's absolute
        // mouse message (type 5) can emulate touch: warp to the touch
        // position and hold the left button down for its duration for a
        // single finger, or -- via touchGesture.ts's GfnTouchGestureTracker
        // -- interpret a second finger as a trackpad-style two-finger
        // gesture (right-click / scroll) instead of a second cursor.
        queuePointerInput: (events: any[]) => {
          this.touchGesture.handleEvents(events);
        },
      };
    }
    if (name === 'chat') {
      // The mic rides the peer connection (see GfnWebRtcClient.startMic).
      // This object is rebuilt on every call, so whether the mic is sending
      // lives on the client, not in a closure: `isPaused` must still read
      // false on the next toggle, or the mic could never be turned off.
      const client = this.gfnClient;
      return {
        get isPaused() {
          return !client?.micSending;
        },
        startMic: () => client?.startMic() ?? Promise.resolve(false),
        stopMic: () => client?.stopMic(),
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

  // True once the server's offer carried a microphone line (the in-game menu
  // shows the mic button only then).
  get micAvailable(): boolean {
    return this.gfnClient?.micAvailable ?? false;
  }

  // Id of the current remote video track in NativeVideoTrackHolder, for
  // NativeStream's RTCFsrView nativeTrackId prop.
  get videoTrackId(): string | null {
    return this._videoTrackId;
  }

  // Background-mute/foreground-restore gain -- mirrors the xCloud path's
  // track._setVolume(gain) on react-native-webrtc's remote audio track.
  // Native-only (the JS client's remote audio track, when active, is
  // volume-controlled directly via trackHandler's {track} path instead --
  // see NativeStream's own applyRemoteAudioGain).
  setRemoteAudioVolume(volume: number): void {
    (this.gfnClient as GfnNativeWebRtcClient | null)?.setRemoteAudioVolume?.(
      volume,
    );
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

  // Mirror the xCloud client's stats derivation so NativeStream's performance
  // overlay shows real numbers on GFN too. Reads the GFN peer connection's
  // WebRTC stats and keeps a previous sample for per-second deltas.
  getStreamState(): Promise<any> {
    const performances: any = {
      resolution: '',
      rtt: '-1 (-1%)',
      jit: '-1',
      fps: 0,
      pl: '-1 (-1%)',
      fl: '-1 (-1%)',
      br: '',
      decode: '',
      // Standard WebRTC inbound-rtp field naming the actual decoder
      // implementation in use (e.g. a vendor-named MediaCodec component for
      // hardware, or an "OMX.google."/"c2.android." one for software) --
      // shows hardware-vs-software decode on-screen without needing adb.
      decoder: '',
      // Which CloudMatch region the session actually landed on, so a bad
      // region resolution (falling back to the global default endpoint
      // instead of the local one) is visible instead of only inferred from
      // symptoms like high RTT/jitter.
      region: regionLabelFromBase(this.session?.streamingBaseUrl),
      // Active candidate-pair's local candidate type/protocol, e.g. "srflx/udp"
      // or "relay/udp" (TURN relay — an extra hop, and a common cause of
      // higher/less stable latency than a direct connection).
      transport: '',
    };
    const client = this.gfnClient;
    if (!client) {
      return Promise.resolve(performances);
    }
    return client
      .getStats()
      .then((stats: any) => {
        if (!stats || typeof stats.forEach !== 'function') {
          return performances;
        }
        // Local candidate id -> {type, protocol}, so the active candidate-pair
        // can report whether media is flowing direct (host/srflx) or via a
        // TURN relay — relayed paths add a hop and are a common source of
        // extra latency/jitter versus a direct connection.
        const localCandidates = new Map<
          string,
          {type?: string; protocol?: string}
        >();
        stats.forEach((stat: any) => {
          if (stat.type === 'local-candidate' && stat.id) {
            localCandidates.set(stat.id, {
              type: stat.candidateType,
              protocol: stat.protocol,
            });
          }
        });
        stats.forEach((stat: any) => {
          if (
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'video' || stat.mediaType === 'video')
          ) {
            if (stat.frameWidth && stat.frameHeight) {
              performances.resolution = `${stat.frameWidth} X ${stat.frameHeight}`;
            }
            performances.fps = stat.framesPerSecond || 0;
            if (stat.decoderImplementation) {
              performances.decoder = stat.decoderImplementation;
            }

            const framesDropped = stat.framesDropped;
            if (framesDropped !== undefined) {
              const framesReceived = stat.framesReceived;
              const framesDroppedPercentage = (
                (framesDropped * 100) /
                (framesDropped + framesReceived || 1)
              ).toFixed(2);
              performances.fl = `${framesDropped} (${framesDroppedPercentage}%)`;
            }

            const packetsLost = stat.packetsLost;
            if (packetsLost !== undefined) {
              const packetsReceived = stat.packetsReceived;
              const packetsLostPercentage = (
                (packetsLost * 100) /
                (packetsLost + packetsReceived || 1)
              ).toFixed(2);
              performances.pl = `${packetsLost} (${packetsLostPercentage}%)`;
            }

            if (this.lastStat) {
              try {
                const lastStat = this.lastStat;
                const timeDiff = stat.timestamp - lastStat.timestamp;
                if (timeDiff !== 0) {
                  const bitrate =
                    (8 * (stat.bytesReceived - lastStat.bytesReceived)) /
                    timeDiff /
                    1000;
                  performances.br = `${bitrate.toFixed(1)} Mbps`;
                } else {
                  performances.br = '--';
                }

                const bufferDelayDiff =
                  stat.jitterBufferDelay - lastStat.jitterBufferDelay;
                const emittedCountDiff =
                  stat.jitterBufferEmittedCount -
                  lastStat.jitterBufferEmittedCount;
                if (emittedCountDiff > 0) {
                  performances.jit = `${Math.round(
                    (bufferDelayDiff / emittedCountDiff) * 1000,
                  )}ms`;
                } else {
                  performances.jit = '--';
                }

                const totalDecodeTimeDiff =
                  stat.totalDecodeTime - lastStat.totalDecodeTime;
                const framesDecodedDiff =
                  stat.framesDecoded - lastStat.framesDecoded;
                if (framesDecodedDiff !== 0) {
                  let currentDecodeTime =
                    (totalDecodeTimeDiff / framesDecodedDiff) * 1000;
                  // Decode time reads high on Android Chromium; match xCloud's
                  // correction.
                  if (currentDecodeTime > 20) {
                    currentDecodeTime -= 20;
                  }
                  if (currentDecodeTime > 17) {
                    currentDecodeTime -= 15;
                  }
                  performances.decode = `${currentDecodeTime.toFixed(2)}ms`;
                } else {
                  performances.decode = '--';
                }
              } catch {}
            }
            this.lastStat = stat;
          } else if (
            stat.type === 'candidate-pair' &&
            (stat.state === 'succeeded' || stat.nominated)
          ) {
            const roundTripTime =
              typeof stat.currentRoundTripTime !== 'undefined'
                ? stat.currentRoundTripTime * 1000
                : '???';
            performances.rtt = `${roundTripTime}ms`;
            const local = localCandidates.get(stat.localCandidateId);
            if (local?.type) {
              performances.transport =
                local.type === 'relay'
                  ? `relay/${local.protocol ?? '?'}`
                  : `${local.type}/${local.protocol ?? '?'}`;
            }
          }
        });
        return performances;
      })
      .catch(() => performances);
  }
}
