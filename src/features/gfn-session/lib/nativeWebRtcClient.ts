import {NativeModules, NativeEventEmitter} from 'react-native';
import {GfnSession, parseResolution} from '../api/session';
import {GamepadInput} from '../../../entities/gfn-input';
import {GfnConnectionState} from './webrtcClient';

const {GfnWebRtcModule} = NativeModules;

type Options = {
  onTrack?: (kind: 'video' | 'audio', trackId: string) => void;
  onState?: (state: GfnConnectionState, detail?: string) => void;
};

// Kotlin-native replacement for GfnWebRtcClient (webrtcClient.ts in this
// same directory), used by GfnStreamAdapter in production. Talks to
// GfnWebRtcModule (android/.../java/com/xstreaming/gfn/GfnWebRtcModule.kt),
// which does the actual signaling/SDP/data-channel work in Kotlin via
// org.webrtc directly, with no react-native-webrtc or JS<->native bridge in
// that hot path at all. This class is just the bridge call wrapper. Video
// rendering goes through RTCFsrView's nativeTrackId prop (backed by
// NativeVideoTrackHolder), not react-native-webrtc's MediaStream/RTCView --
// see GfnStreamAdapter's trackHandler wiring. The CloudMatch
// session-creation HTTP polling in session.ts stays in JS; so does the
// streaming/queue-setup flow in streamAdapter.ts.
export class GfnNativeWebRtcClient {
  private readonly emitter = new NativeEventEmitter();
  private stateSub: {remove(): void} | null = null;
  private trackSub: {remove(): void} | null = null;
  private micAvailableSub: {remove(): void} | null = null;
  private micAvailableCache = false;
  private micSendingCache = false;

  constructor(
    private readonly session: GfnSession,
    private readonly options: Options = {},
  ) {}

  connect(): void {
    if (!GfnWebRtcModule) {
      this.options.onState?.(
        'failed',
        'GfnWebRtcModule not available (native module missing)',
      );
      return;
    }
    this.stateSub = this.emitter.addListener(
      'GfnWebRtcStateChanged',
      (e: {state: string; detail?: string | null}) => {
        this.options.onState?.(
          e.state.toLowerCase() as GfnConnectionState,
          e.detail ?? undefined,
        );
      },
    );
    this.trackSub = this.emitter.addListener(
      'GfnWebRtcTrackReady',
      (e: {kind: 'video' | 'audio'; trackId: string}) => {
        this.options.onTrack?.(e.kind, e.trackId);
      },
    );
    this.micAvailableSub = this.emitter.addListener(
      'GfnWebRtcMicAvailable',
      () => {
        this.micAvailableCache = true;
      },
    );

    // The Kotlin side only needs the resolved width/height, not the
    // "WxH" string -- reuse the same parse the TS client's nvstSdp build
    // does, so both read the same value from a possibly-odd settings string.
    const {width, height} = parseResolution(this.session.settings.resolution);
    const payload = {
      sessionId: this.session.sessionId,
      signalingUrl: this.session.signalingUrl,
      iceServers: this.session.iceServers.map(s => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
      settings: {
        resolution: `${width}x${height}`,
        fps: this.session.settings.fps,
        maxBitrateMbps: this.session.settings.maxBitrateMbps,
        codec: this.session.settings.codec,
      },
    };
    (
      GfnWebRtcModule.connect(JSON.stringify(payload)) as Promise<boolean>
    ).catch((e: Error) =>
      this.options.onState?.('failed', `native connect() failed: ${e.message}`),
    );
  }

  sendGamepad(input: GamepadInput): void {
    GfnWebRtcModule?.sendGamepad(
      input.controllerId,
      input.buttons,
      input.leftTrigger,
      input.rightTrigger,
      input.leftStickX,
      input.leftStickY,
      input.rightStickX,
      input.rightStickY,
    );
  }

  sendMouseMove(dx: number, dy: number): void {
    GfnWebRtcModule?.sendMouseMove(dx, dy);
  }

  sendMouseAbsolute(
    normalizedX: number,
    normalizedY: number,
    reliable = false,
  ): void {
    GfnWebRtcModule?.sendMouseAbsolute(normalizedX, normalizedY, reliable);
  }

  sendMouseButtonDown(button: number): void {
    GfnWebRtcModule?.sendMouseButtonDown(button);
  }

  sendMouseButtonUp(button: number): void {
    GfnWebRtcModule?.sendMouseButtonUp(button);
  }

  sendMouseWheel(delta: number, horizontal = 0): void {
    GfnWebRtcModule?.sendMouseWheel(delta, horizontal);
  }

  sendKeyDown(virtualKey: number, modifiers: number): void {
    GfnWebRtcModule?.sendKeyDown(virtualKey, modifiers);
  }

  sendKeyUp(virtualKey: number, modifiers: number): void {
    GfnWebRtcModule?.sendKeyUp(virtualKey, modifiers);
  }

  async startMic(): Promise<boolean> {
    if (!GfnWebRtcModule) {
      return false;
    }
    const started = (await GfnWebRtcModule.startMic()) ?? false;
    this.micSendingCache = started;
    return started;
  }

  stopMic(): void {
    GfnWebRtcModule?.stopMic();
    this.micSendingCache = false;
  }

  // True once the server's offer carried a microphone line this session
  // (cached from the one-shot GfnWebRtcMicAvailable event -- see
  // GfnWebRtcClient.kt's prepareMicTransceiver).
  get micAvailable(): boolean {
    return this.micAvailableCache;
  }

  get micSending(): boolean {
    return this.micSendingCache;
  }

  // Mirrors the TS client's remote-audio-track._setVolume(gain), used for
  // the background-mute/foreground-restore gain NativeStream applies.
  setRemoteAudioVolume(volume: number): void {
    GfnWebRtcModule?.setRemoteAudioVolume(volume);
  }

  // Resolves to a plain diagnostic string (the native RTCStatsReport's own
  // toString()), not the structured, forEach-able report the TS client's
  // getStats() returns -- the performance overlay's own stats parsing isn't
  // ported to read this shape yet.
  getStats(): Promise<string | null> {
    return GfnWebRtcModule?.getStats() ?? Promise.resolve(null);
  }

  dispose(): void {
    this.stateSub?.remove();
    this.trackSub?.remove();
    this.micAvailableSub?.remove();
    this.stateSub = null;
    this.trackSub = null;
    this.micAvailableSub = null;
    this.micAvailableCache = false;
    this.micSendingCache = false;
    GfnWebRtcModule?.dispose();
  }
}
