import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';
import {GfnSession} from './session';
import {
  GfnSignalingClient,
  GfnIceCandidate,
  GfnSignalingEvent,
} from './signaling';
import {buildNvstSdp, extractIceCredentials} from './nvstSdp';
import {
  GfnInputEncoder,
  GamepadInput,
  parseInputHandshake,
  startInputSessionClock,
} from './inputEncoding';

// GeForce NOW WebRTC streaming client for React Native. Given a ready CloudMatch
// session, it connects the nvst signaling socket, answers the server's WebRTC
// offer (with the nvstSdp blob), trickles ICE, surfaces the remote MediaStream
// for <RTCView>, and — once the input handshake arrives — sends gamepad state
// over the input data channels. Ported/condensed from OpenNOW (MIT).

export type GfnConnectionState =
  | 'connecting'
  | 'signaling'
  | 'negotiating'
  | 'connected'
  | 'disconnected'
  | 'failed';

type Options = {
  onStream?: (stream: MediaStream) => void;
  onState?: (state: GfnConnectionState, detail?: string) => void;
};

const DEFAULT_PARTIAL_RELIABLE_MS = 30;
// Connected + XInput-style bitmap for controller 0 (bit 0 | bit 8).
const CONTROLLER0_BITMAP = 0x0101;

export class GfnWebRtcClient {
  private pc: RTCPeerConnection | null = null;
  private signaling: GfnSignalingClient;
  private reliableInput: any = null;
  private partiallyReliableInput: any = null;
  private readonly encoder = new GfnInputEncoder();
  private inputReady = false;
  private answerSent = false;
  private disposed = false;
  private partialReliableThresholdMs = DEFAULT_PARTIAL_RELIABLE_MS;
  private queuedLocalIce: GfnIceCandidate[] = [];
  private queuedRemoteIce: GfnIceCandidate[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;

  constructor(
    private readonly session: GfnSession,
    private readonly options: Options = {},
  ) {
    this.signaling = new GfnSignalingClient(
      session.signalingUrl,
      session.sessionId,
    );
  }

  private setState(state: GfnConnectionState, detail?: string): void {
    this.options.onState?.(state, detail);
  }

  connect(): void {
    this.setState('signaling');
    this.signaling.onEvent(event => this.handleSignalingEvent(event));
    this.signaling.connect();
  }

  private handleSignalingEvent(event: GfnSignalingEvent): void {
    if (this.disposed) {
      return;
    }
    switch (event.type) {
      case 'connected':
        this.setState('signaling', 'signaling connected');
        break;
      case 'offer':
        this.handleOffer(event.sdp).catch(err =>
          this.setState('failed', `offer handling failed: ${String(err)}`),
        );
        break;
      case 'remote-ice':
        this.addRemoteCandidate(event.candidate).catch(() => {});
        break;
      case 'disconnected':
        this.setState('disconnected', event.reason);
        break;
      case 'error':
        this.setState('failed', event.message);
        break;
    }
  }

  private async handleOffer(offerSdp: string): Promise<void> {
    this.setState('negotiating');
    const thresholdMatch = /a=ri.partialReliableThresholdMs:(\d+)/.exec(
      offerSdp,
    );
    if (thresholdMatch) {
      this.partialReliableThresholdMs = parseInt(thresholdMatch[1], 10);
    }

    const pc = new RTCPeerConnection({
      iceServers: this.session.iceServers.map(s => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    } as any);
    this.pc = pc;

    this.createDataChannels(pc);

    (pc as any).onicecandidate = (e: any) => {
      if (!e.candidate) {
        return;
      }
      const candidate: GfnIceCandidate = {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
        usernameFragment: e.candidate.usernameFragment,
      };
      if (!this.answerSent) {
        this.queuedLocalIce.push(candidate);
        return;
      }
      this.signaling.sendIceCandidate(candidate);
    };

    (pc as any).ontrack = (e: any) => {
      const incoming: MediaStream | undefined = e.streams?.[0];
      if (incoming) {
        this.stream = incoming;
      } else {
        if (!this.stream) {
          this.stream = new MediaStream();
        }
        this.stream.addTrack(e.track);
      }
      if (this.stream) {
        this.options.onStream?.(this.stream);
      }
    };

    (pc as any).onconnectionstatechange = () => {
      const st = (pc as any).connectionState;
      if (st === 'connected') {
        this.setState('connected');
      } else if (st === 'failed') {
        this.setState('failed', 'peer connection failed');
      } else if (st === 'disconnected') {
        this.setState('disconnected', 'peer disconnected');
      }
    };

    await pc.setRemoteDescription(
      new RTCSessionDescription({type: 'offer', sdp: offerSdp}),
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const finalSdp = (pc as any).localDescription?.sdp ?? answer.sdp;
    const credentials = extractIceCredentials(finalSdp);
    const {width, height} = this.parseResolution();
    const nvstSdp = buildNvstSdp({
      width,
      height,
      fps: 60,
      maxBitrateKbps: 30000,
      partialReliableThresholdMs: this.partialReliableThresholdMs,
      codec: 'H264',
      credentials,
    });

    this.signaling.sendAnswer({sdp: finalSdp, nvstSdp});
    this.answerSent = true;

    // Flush candidates queued in both directions.
    for (const c of this.queuedLocalIce.splice(0)) {
      this.signaling.sendIceCandidate(c);
    }
    for (const c of this.queuedRemoteIce.splice(0)) {
      this.addRemoteCandidate(c).catch(() => {});
    }
  }

  private createDataChannels(pc: RTCPeerConnection): void {
    // Stats channel (server -> client): unreliable.
    const statsChannel = (pc as any).createDataChannel('stats_channel', {
      ordered: false,
      maxRetransmits: 0,
    });
    statsChannel.binaryType = 'arraybuffer';

    // Reliable input channel — the server's input handshake arrives here.
    const reliable = (pc as any).createDataChannel('input_channel_v1', {
      ordered: true,
    });
    reliable.binaryType = 'arraybuffer';
    reliable.addEventListener('message', (event: any) => {
      this.onInputChannelMessage(event.data);
    });
    this.reliableInput = reliable;

    // Partially reliable input channel — lower latency for gamepad.
    const pr = (pc as any).createDataChannel(
      'input_channel_partially_reliable',
      {
        ordered: false,
        maxPacketLifeTime: this.partialReliableThresholdMs,
      },
    );
    pr.binaryType = 'arraybuffer';
    this.partiallyReliableInput = pr;
  }

  private async onInputChannelMessage(data: any): Promise<void> {
    const bytes = await toBytes(data);
    if (!bytes) {
      return;
    }
    if (this.inputReady) {
      // Post-handshake messages are haptics; ignored for now.
      return;
    }
    const version = parseInputHandshake(bytes);
    if (version === null) {
      return;
    }
    startInputSessionClock();
    this.encoder.setProtocolVersion(version);
    this.inputReady = true;
    this.startInputHeartbeat();
  }

  private startInputHeartbeat(): void {
    this.stopInputHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.reliableInput?.readyState === 'open') {
        try {
          this.reliableInput.send(this.encoder.encodeHeartbeat());
        } catch {}
      }
    }, 1000);
  }

  private stopInputHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Send a controller state snapshot. Safe to call before input is ready (no-op).
  sendGamepad(input: GamepadInput): void {
    if (!this.inputReady) {
      return;
    }
    const usePr = this.partiallyReliableInput?.readyState === 'open';
    const channel = usePr ? this.partiallyReliableInput : this.reliableInput;
    if (channel?.readyState !== 'open') {
      return;
    }
    try {
      channel.send(
        this.encoder.encodeGamepadState(input, CONTROLLER0_BITMAP, usePr),
      );
    } catch {}
  }

  private async addRemoteCandidate(candidate: GfnIceCandidate): Promise<void> {
    if (!this.pc || !(this.pc as any).remoteDescription) {
      this.queuedRemoteIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(
        new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid ?? undefined,
          sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
        }),
      );
    } catch {}
  }

  private parseResolution(): {width: number; height: number} {
    return {width: 1920, height: 1080};
  }

  // Expose the peer connection's WebRTC stats for the performance overlay.
  // Resolves null before the connection exists.
  getStats(): Promise<any> {
    if (!this.pc) {
      return Promise.resolve(null);
    }
    return (this.pc as any).getStats();
  }

  dispose(): void {
    this.disposed = true;
    this.stopInputHeartbeat();
    this.signaling.disconnect();
    if (this.reliableInput) {
      try {
        this.reliableInput.close();
      } catch {}
    }
    if (this.partiallyReliableInput) {
      try {
        this.partiallyReliableInput.close();
      } catch {}
    }
    if (this.pc) {
      try {
        (this.pc as any).close();
      } catch {}
      this.pc = null;
    }
  }
}

// Normalize a data-channel payload (ArrayBuffer / typed array / Blob-ish) into
// a Uint8Array. RN data channels deliver ArrayBuffer when binaryType is set.
const toBytes = async (data: any): Promise<Uint8Array | null> => {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
};
