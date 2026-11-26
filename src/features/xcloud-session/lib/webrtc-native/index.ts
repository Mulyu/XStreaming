import {NativeModules, NativeEventEmitter} from 'react-native';
import ControlChannel from '../webrtc/Channel/Control';
import MessageChannel from '../webrtc/Channel/Message';
import NativeChatChannel from './NativeChatChannel';

const {XcloudWebRtcModule} = NativeModules;

const DEFAULT_SUPPORTED_SYSTEM_UIS = [10, 19, 31, 27, 32, -44, 40, 41, -43];

// A getChannel(name) shim standing in for a real react-native-webrtc
// RTCDataChannel, for the three JSON channels (control/chat/message) --
// Control.ts and Message.ts are reused completely unchanged against this,
// via Base.ts's own send()/getClient() machinery. The "input" channel has
// no shim here: it's fully native (see getChannelProcessor('input') below),
// so nothing ever calls getChannel('input').
class NativeChannelHandle {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';

  constructor(private readonly name: string) {}

  send(data: Uint8Array | ArrayBuffer | string): void {
    if (this.readyState !== 'open') {
      return;
    }
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      text = new TextDecoder().decode(bytes);
    }
    XcloudWebRtcModule?.sendChannelMessage(this.name, text);
  }
}

// Kotlin-native replacement for xcloud-session's own webRTCClient
// (lib/webrtc/index.ts), used by NativeStream in production. Same public
// shape as that class (NativeStream drives both through the same code
// path -- see native-stream/index.tsx), but the PeerConnection/ICE/SDP and
// the binary input-channel protocol run in
// android/.../java/com/xstreaming/xcloud/XcloudWebRtcClient.kt via
// org.webrtc directly. The JSON control/chat/message channels stay as
// Control.ts/Message.ts (and this directory's NativeChatChannel.ts for the
// mic), unchanged, talking to this class as if it were still the original
// client. xcloudSessionClient.ts's REST session/SDP/ICE exchange is
// untouched -- this class only supplies the local offer and takes the
// remote answer/ICE candidates, same split as GFN's native client keeps
// CloudMatch's own REST polling in JS.
class XcloudNativeWebRtcClient {
  _coop = false;
  _inputDriver: {start(): void; stop(): void};
  _polling_rate = 62.5;
  _maxTouchPoints = 0;
  _gpState: any = null;

  private readonly emitter = new NativeEventEmitter();
  private subs: Array<{remove(): void}> = [];
  private isResetting = false;
  private hasVideoTrack = false;
  private hasAudioTrack = false;
  private hasSentInitialVideoKeyframeRequest = false;

  private channelHandles: Record<string, NativeChannelHandle> = {
    control: new NativeChannelHandle('control'),
    chat: new NativeChannelHandle('chat'),
    message: new NativeChannelHandle('message'),
  };
  private channelProcessors: Record<string, any> = {};

  private iceCandidates: Array<{
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }> = [];

  private trackHandler: ((event: any) => void) | null = null;
  private trackAddHandler: ((event: any) => void) | null = null;
  private connectedHandler: ((state: string, detail?: string) => void) | null =
    null;
  private sdpHandler: ((client: any, offer: {sdp: string}) => void) | null =
    null;
  private rumbleHandler: ((data: any) => void) | null = null;
  private systemUiHandler: ((payload: any) => boolean | void) | null = null;
  private messageHandler: ((payload: any) => boolean | void) | null = null;
  private supportedSystemUis: number[] | undefined;

  // Previous inbound-video stat sample, for getStreamState()'s bitrate/
  // jitter/decode-time deltas -- an instance field rather than the
  // original JS client's globalThis._lastStat (same cleanup
  // GfnStreamAdapter's own getStreamState() already made).
  private lastStat: any = null;
  // getAudioVolume()/sampleAudioLevel() state, ported from the original
  // JS client's _updateAudioLevelFromStat/_clampAudioLevel.
  private audioEnergySnapshot: {
    totalAudioEnergy: number;
    totalSamplesReceived: number;
  } | null = null;
  private audioLevel = 0;
  private hasAudioLevelSample = false;

  constructor() {
    // Matches Channel/Input.ts's own queueGamepadState/queuePointerInput/
    // addProcessedFrame shape, but delegates straight to the native bridge
    // -- the poll-rate-driven resend loop lives in Kotlin, not here.
    // queueGamepadState/queueGamepadStates/flushGamepadInput are only ever
    // called (in the original TS) by Driver/Gamepad.ts, which this native
    // client doesn't instantiate -- native-stream/index.tsx drives gamepad
    // input through the top-level setGamepadState() below instead. Kept
    // here for API parity in case anything else reaches for them.
    const inputProcessor = {
      start: () => {
        XcloudWebRtcModule?.startInput();
      },
      stop: () => {},
      destroy: () => {},
      queueGamepadState: (frame: any) => {
        XcloudWebRtcModule?.setGamepadState(JSON.stringify(frame));
      },
      queueGamepadStates: (frames: any[]) => {
        XcloudWebRtcModule?.setGamepadState(JSON.stringify(frames));
      },
      flushGamepadInput: () => {},
      queuePointerInput: (events: any[]) => {
        if (!Array.isArray(events) || events.length === 0) {
          return;
        }
        XcloudWebRtcModule?.queuePointerInput(JSON.stringify(events));
      },
      addProcessedFrame: (frame: any) => {
        XcloudWebRtcModule?.addProcessedFrame(
          frame?.serverDataKey ?? 0,
          frame?.firstFramePacketArrivalTimeMs ?? 0,
          frame?.frameSubmittedTimeMs ?? 0,
          frame?.frameDecodedTimeMs ?? 0,
          frame?.frameRenderedTimeMs ?? Date.now(),
        );
      },
    };
    this.channelProcessors.input = inputProcessor;
    this._inputDriver = {
      start: inputProcessor.start,
      stop: inputProcessor.stop,
    };
  }

  init(): void {
    this.isResetting = false;
    this.hasVideoTrack = false;
    this.hasAudioTrack = false;
    this.hasSentInitialVideoKeyframeRequest = false;
    // Otherwise a reused instance's first getStreamState()/getAudioLevel()
    // after a reconnect would diff against the previous session's last
    // sample -- the new PeerConnection's counters (bytesReceived, etc.)
    // start back near zero, so that diff reads as garbage/negative values
    // until the new counters overtake the old ones.
    this.lastStat = null;
    this.audioEnergySnapshot = null;
    this.audioLevel = 0;
    this.hasAudioLevelSample = false;

    this.channelProcessors.control = new ControlChannel('control', this);
    this.channelProcessors.chat = new NativeChatChannel('chat', this);
    this.channelProcessors.message = new MessageChannel('message', this);

    this.subscribeEvents();
    XcloudWebRtcModule?.init();
  }

  private subscribeEvents(): void {
    this.subs.forEach(s => s.remove());
    this.subs = [
      this.emitter.addListener(
        'XcloudTrackReady',
        (e: {kind: 'video' | 'audio'; trackId: string}) => {
          if (e.kind === 'video') {
            this.hasVideoTrack = true;
          } else {
            this.hasAudioTrack = true;
          }
          if (
            this.hasVideoTrack &&
            this.hasAudioTrack &&
            !this.hasSentInitialVideoKeyframeRequest
          ) {
            this.hasSentInitialVideoKeyframeRequest = true;
            this.requestVideoKeyframe(false);
          }
          this.trackHandler?.({trackId: e.trackId, kind: e.kind});
        },
      ),
      this.emitter.addListener(
        'XcloudStateChanged',
        (e: {state: string; detail?: string | null}) => {
          this.connectedHandler?.(e.state, e.detail ?? undefined);
        },
      ),
      this.emitter.addListener('XcloudChannelOpen', (e: {channel: string}) => {
        const handle = this.channelHandles[e.channel];
        if (handle) {
          handle.readyState = 'open';
        }
        this.channelProcessors[e.channel]?.onOpen?.({});
      }),
      this.emitter.addListener(
        'XcloudChannelMessage',
        (e: {channel: string; data: string}) => {
          this.channelProcessors[e.channel]?.onMessage?.({data: e.data});
        },
      ),
      this.emitter.addListener('XcloudChannelClose', (e: {channel: string}) => {
        const handle = this.channelHandles[e.channel];
        if (handle) {
          handle.readyState = 'closed';
        }
        this.channelProcessors[e.channel]?.onClose?.({});
      }),
      this.emitter.addListener('XcloudLocalIceCandidate', (e: any) => {
        this.iceCandidates.push({
          candidate: e.candidate,
          sdpMid: e.sdpMid ?? undefined,
          sdpMLineIndex: e.sdpMLineIndex,
        });
      }),
      this.emitter.addListener(
        'XcloudRenegotiationOffer',
        (e: {sdp: string}) => {
          this.sdpHandler?.(this, {sdp: e.sdp});
        },
      ),
      this.emitter.addListener('XcloudRumble', (e: any) => {
        this.rumbleHandler?.(e);
      }),
    ];
  }

  // ---- offer/answer + ICE, driven by native-stream/index.tsx's own REST
  // exchange with xcloudSessionClient.ts (untouched) ----

  createOffer(): Promise<{sdp: string; type: string}> {
    return XcloudWebRtcModule.createOffer();
  }

  // Unused in production today (the TS version's own createOffer() already
  // calls setLocalDescription internally, same as this native client's
  // Kotlin side) -- kept for API parity.
  setLocalDescription(offer: any): Promise<any> {
    return Promise.resolve(offer);
  }

  setRemoteOffer(sdp: string): Promise<void> {
    return XcloudWebRtcModule.setRemoteOffer(sdp).then(() => undefined);
  }

  getIceCandidates() {
    return this.iceCandidates;
  }

  setIceCandidates(iceDetails: any): void {
    XcloudWebRtcModule?.setIceCandidates(
      JSON.stringify(Object.values(iceDetails ?? {})),
    );
  }

  close(): void {
    if (this.isResetting) {
      return;
    }
    this.isResetting = true;
    this.lastStat = null;
    this.audioEnergySnapshot = null;
    this.audioLevel = 0;
    this.hasAudioLevelSample = false;
    XcloudWebRtcModule?.close();
    for (const name of Object.keys(this.channelProcessors)) {
      this.channelProcessors[name]?.destroy?.();
    }
    this.channelProcessors = {input: this.channelProcessors.input};
    this._inputDriver.stop();
    this.subs.forEach(s => s.remove());
    this.subs = [];
    this.iceCandidates = [];
  }

  requestVideoKeyframe(ifrRequested = false): void {
    const controlChannel = this.getChannelProcessor('control');
    controlChannel?.sendVideoKeyframeRequested?.(ifrRequested);
  }

  // ---- handler setters NativeStream calls ----

  setTrackHandler(listener: any): void {
    this.trackHandler = listener;
  }

  setTrackAddHandler(listener: any): void {
    this.trackAddHandler = listener;
  }

  setConnectedHandler(listener: any): void {
    this.connectedHandler = listener;
  }

  setSdpHandler(listener: any): void {
    this.sdpHandler = listener;
  }

  setCoop(): void {
    this._coop = true;
  }

  setRumbleHandler(listener: any): void {
    this.rumbleHandler = listener;
  }

  setSystemUiHandler(listener: any): void {
    this.systemUiHandler = listener;
  }

  getSystemUiHandler() {
    return this.systemUiHandler;
  }

  setMessageHandler(listener: any): void {
    this.messageHandler = listener;
  }

  getMessageHandler() {
    return this.messageHandler;
  }

  setSupportedSystemUis(systemUis: number[]): void {
    if (!Array.isArray(systemUis)) {
      this.supportedSystemUis = undefined;
      return;
    }
    this.supportedSystemUis = [...systemUis];
  }

  getSupportedSystemUis() {
    return Array.isArray(this.supportedSystemUis)
      ? this.supportedSystemUis
      : DEFAULT_SUPPORTED_SYSTEM_UIS;
  }

  // ---- channel access, matching webRTCClient's own shape ----

  getChannel(name: string) {
    return this.channelHandles[name];
  }

  getDataChannel(name: string) {
    return this.channelHandles[name];
  }

  getChannelProcessor(name: string) {
    return this.channelProcessors[name];
  }

  // ---- input NativeStream calls ----

  setGamepadState(gpState: any): void {
    this._gpState = gpState;
    XcloudWebRtcModule?.setGamepadState(JSON.stringify(gpState));
  }

  setPollRate(value: number): void {
    this._polling_rate = value || 62.5;
    XcloudWebRtcModule?.setPollRate(this._polling_rate);
  }

  setMaxTouchPoints(value: number): void {
    const next = Math.max(0, Math.min(255, Math.floor(Number(value) || 0)));
    this._maxTouchPoints = next;
    XcloudWebRtcModule?.setMaxTouchPoints(next);
  }

  getMaxTouchPoints(): number {
    return this._maxTouchPoints;
  }

  // ---- mic/audio volume ----

  setRemoteAudioVolume(volume: number): void {
    XcloudWebRtcModule?.setRemoteAudioVolume(volume);
  }

  // ---- stats for the performance overlay ----
  //
  // XcloudWebRtcModule.getStats() resolves an array of plain stat objects
  // (StatsReportConverter.kt converts the native RTCStatsReport into the
  // same W3C-webrtc-stats shape react-native-webrtc's own getStats()
  // returned, which this parsing -- ported from the original JS client's
  // getStreamState()/getAudioVolume()/_updateAudioLevelFromStat -- expects).

  private clampAudioLevel(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value;
  }

  private updateAudioLevelFromStat(stat: any): number | undefined {
    let newLevel: number | undefined;
    if (typeof stat.audioLevel === 'number') {
      newLevel = this.clampAudioLevel(stat.audioLevel);
    } else if (
      typeof stat.totalAudioEnergy === 'number' &&
      typeof stat.totalSamplesReceived === 'number'
    ) {
      const previousSample = this.audioEnergySnapshot;
      const nextSample = {
        totalAudioEnergy: stat.totalAudioEnergy,
        totalSamplesReceived: stat.totalSamplesReceived,
      };
      if (
        previousSample &&
        nextSample.totalSamplesReceived > previousSample.totalSamplesReceived
      ) {
        const energyDiff =
          nextSample.totalAudioEnergy - previousSample.totalAudioEnergy;
        const samplesDiff =
          nextSample.totalSamplesReceived - previousSample.totalSamplesReceived;
        if (samplesDiff > 0 && energyDiff >= 0) {
          const energyPerSample = energyDiff / samplesDiff;
          newLevel = this.clampAudioLevel(Math.sqrt(energyPerSample));
        }
      }
      this.audioEnergySnapshot = nextSample;
    }

    if (typeof newLevel === 'number') {
      this.audioLevel = newLevel;
      this.hasAudioLevelSample = true;
    }
    return newLevel;
  }

  getAudioVolume(): Promise<number> {
    let volume = 0;
    return XcloudWebRtcModule.getStats()
      .then((stats: any) => {
        if (!stats || typeof stats.forEach !== 'function') {
          return volume;
        }
        stats.forEach((stat: any) => {
          if (
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'audio' || stat.mediaType === 'audio')
          ) {
            const updatedLevel = this.updateAudioLevelFromStat(stat);
            if (typeof updatedLevel === 'number') {
              volume = Math.round(updatedLevel * 100);
            } else if (this.hasAudioLevelSample) {
              volume = Math.round(this.audioLevel * 100);
            }
          }
        });
        return volume;
      })
      .catch(() => volume);
  }

  async sampleAudioLevel(): Promise<number> {
    try {
      const stats = await XcloudWebRtcModule.getStats();
      if (stats && typeof stats.forEach === 'function') {
        stats.forEach((stat: any) => {
          if (
            stat.type === 'inbound-rtp' &&
            (stat.kind === 'audio' || stat.mediaType === 'audio')
          ) {
            this.updateAudioLevelFromStat(stat);
          }
        });
      }
    } catch {}
    return this.audioLevel;
  }

  getAudioLevel(): number {
    return this.audioLevel;
  }

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
      decoder: '',
    };
    return XcloudWebRtcModule.getStats()
      .then((stats: any) => {
        if (!stats || typeof stats.forEach !== 'function') {
          return performances;
        }
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
            } else {
              performances.fl = '-1 (-1%)';
            }

            const packetsLost = stat.packetsLost;
            if (packetsLost !== undefined) {
              const packetsReceived = stat.packetsReceived;
              const packetsLostPercentage = (
                (packetsLost * 100) /
                (packetsLost + packetsReceived || 1)
              ).toFixed(2);
              performances.pl = `${packetsLost} (${packetsLostPercentage}%)`;
            } else {
              performances.pl = '-1 (-1%)';
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
                  // Decode time reads high on Android Chromium; match the
                  // original JS client's own correction.
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
            stat.state === 'succeeded'
          ) {
            const roundTripTime =
              typeof stat.currentRoundTripTime !== 'undefined'
                ? stat.currentRoundTripTime * 1000
                : '???';
            performances.rtt = `${roundTripTime}ms`;
          }
        });
        return performances;
      })
      .catch(() => performances);
  }
}

export default XcloudNativeWebRtcClient;
