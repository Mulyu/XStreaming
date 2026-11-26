import {NativeModules, NativeEventEmitter} from 'react-native';
import {GfnSession, parseResolution} from '../api/session';
import {GamepadInput} from '../../../entities/gfn-input';
import {GfnConnectionState} from './webrtcClient';

const {GfnWebRtcModule} = NativeModules;

type Options = {
  onTrack?: (kind: 'video' | 'audio', trackId: string) => void;
  onState?: (state: GfnConnectionState, detail?: string) => void;
};

// Experimental Kotlin-native alternative to GfnWebRtcClient (webrtcClient.ts
// in this same directory) -- same call shape, so it can become a drop-in
// swap for GfnStreamAdapter once video-track rendering is wired up. Talks to
// GfnWebRtcModule (android/.../java/com/xstreaming/gfn/GfnWebRtcModule.kt),
// which does the actual signaling/SDP/data-channel work in Kotlin via
// org.webrtc directly, with no react-native-webrtc or JS<->native bridge in
// that hot path at all. This class is just the bridge call wrapper; nothing
// in the app constructs it yet -- see the "Kotlin移植性調査" doc for why
// this is the first slice and what still isn't ported (the CloudMatch
// session-creation HTTP polling in session.ts stays in JS; so does actually
// attaching the remote video track to a view).
//
// Not build-verified: this and the Kotlin it talks to were written without
// access to an Android SDK/Gradle toolchain in the environment that wrote
// them. Build it in Android Studio and fix whatever doesn't compile before
// relying on it.
export class GfnNativeWebRtcClient {
  private readonly emitter = new NativeEventEmitter();
  private stateSub: {remove(): void} | null = null;
  private trackSub: {remove(): void} | null = null;

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
    return (await GfnWebRtcModule.startMic()) ?? false;
  }

  stopMic(): void {
    GfnWebRtcModule?.stopMic();
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
    this.stateSub = null;
    this.trackSub = null;
    GfnWebRtcModule?.dispose();
  }
}
