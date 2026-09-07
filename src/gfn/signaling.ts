// GeForce NOW "nvst" signaling client. Connects to the session's signaling
// WebSocket, performs the peer sign-in handshake, and relays the server's WebRTC
// OFFER + trickled ICE candidates to the WebRTC client, sending our ANSWER (+
// nvstSdp) and local ICE back. The client is peer_role=1; the game server is the
// offerer. Ported from OpenNOW (MIT) for React Native's WebSocket.

const GFN_PLAY_ORIGIN = 'https://play.geforcenow.com';
const GFN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';

export type GfnIceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type GfnSignalingEvent =
  | {type: 'connected'}
  | {type: 'offer'; sdp: string}
  | {type: 'remote-ice'; candidate: GfnIceCandidate}
  | {type: 'disconnected'; reason: string}
  | {type: 'error'; message: string};

export type GfnAnswer = {sdp: string; nvstSdp?: string};

export class GfnSignalingClient {
  private ws: WebSocket | null = null;
  private peerId = 0;
  private remotePeerId = 1;
  private readonly peerName = `peer-${Math.floor(
    Math.random() * 10_000_000_000,
  )}`;
  private ackCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private listener: (event: GfnSignalingEvent) => void = () => {};

  constructor(
    private readonly signalingUrl: string,
    private readonly sessionId: string,
  ) {}

  onEvent(listener: (event: GfnSignalingEvent) => void): void {
    this.listener = listener;
  }

  private emit(event: GfnSignalingEvent): void {
    this.listener(event);
  }

  private buildSignInUrl(): string {
    const base = this.signalingUrl.replace(/\/?$/, '/');
    const url = base.startsWith('wss://') ? base : `wss://${base}`;
    const params = new URLSearchParams({
      peer_id: this.peerName,
      version: '2',
      peer_role: '1',
      pairing_id: this.sessionId,
    });
    return `${url}sign_in?${params.toString()}`;
  }

  private nextAckId(): number {
    this.ackCounter += 1;
    return this.ackCounter;
  }

  private sendJson(payload: unknown): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendJson({hb: 1}), 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendPeerInfo(): void {
    this.sendJson({
      ackid: this.nextAckId(),
      peer_info: {
        browser: 'Chrome',
        browserVersion: '131',
        connected: true,
        id: this.peerId,
        name: this.peerName,
        peerRole: 0,
        resolution: '1920x1080',
        version: 2,
      },
    });
  }

  connect(): void {
    const url = this.buildSignInUrl();
    // Host being hit, surfaced in errors so a wrong signaling host (e.g. the
    // zone load balancer, which 404s /nvst/) is diagnosable on-device.
    const host = url.replace(/^wss?:\/\//, '').split('/')[0];
    const protocol = `x-nv-sessionid.${this.sessionId}`;
    // RN WebSocket accepts (url, protocols, options) — headers apply on Android.
    const ws = new WebSocket(url, protocol, {
      headers: {Origin: GFN_PLAY_ORIGIN, 'User-Agent': GFN_USER_AGENT},
    } as any);
    this.ws = ws;

    ws.onopen = () => {
      this.sendPeerInfo();
      this.startHeartbeat();
      this.emit({type: 'connected'});
    };
    ws.onmessage = event => {
      const data = event.data;
      this.handleMessage(typeof data === 'string' ? data : String(data));
    };
    ws.onerror = (event: any) => {
      this.emit({
        type: 'error',
        message: `Signaling error @ ${host}: ${event?.message ?? 'unknown'}`,
      });
    };
    ws.onclose = event => {
      this.stopHeartbeat();
      if (this.ws === ws) {
        this.ws = null;
        this.emit({
          type: 'disconnected',
          reason: (event as any)?.reason || 'socket closed',
        });
      }
    };
  }

  private handleMessage(text: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (parsed.peer_info) {
      if (
        typeof parsed.peer_info.id === 'number' &&
        parsed.peer_info.name === this.peerName
      ) {
        this.peerId = parsed.peer_info.id;
      }
    }

    if (
      typeof parsed.ackid === 'number' &&
      parsed.peer_info?.id !== this.peerId
    ) {
      this.sendJson({ack: parsed.ackid});
    }

    if (parsed.hb) {
      this.sendJson({hb: 1});
      return;
    }

    if (parsed.error === 'peerRemoved') {
      this.emit({type: 'disconnected', reason: 'peerRemoved'});
      return;
    }

    const msg: string | undefined = parsed.peer_msg?.msg;
    if (!msg) {
      return;
    }
    if (typeof parsed.peer_msg.from === 'number') {
      this.remotePeerId = parsed.peer_msg.from;
    }

    const trimmed = msg.trim();
    if (trimmed === 'BYE') {
      this.emit({type: 'disconnected', reason: 'BYE'});
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (payload.type === 'offer' && typeof payload.sdp === 'string') {
      this.emit({type: 'offer', sdp: payload.sdp});
      return;
    }
    if (typeof payload.candidate === 'string') {
      this.emit({
        type: 'remote-ice',
        candidate: {
          candidate: payload.candidate,
          sdpMid: typeof payload.sdpMid === 'string' ? payload.sdpMid : null,
          sdpMLineIndex:
            typeof payload.sdpMLineIndex === 'number'
              ? payload.sdpMLineIndex
              : 0,
          usernameFragment:
            typeof payload.usernameFragment === 'string'
              ? payload.usernameFragment
              : null,
        },
      });
    }
  }

  sendAnswer(answer: GfnAnswer): void {
    this.sendJson({
      peer_msg: {
        from: this.peerId,
        to: this.remotePeerId,
        msg: JSON.stringify({
          type: 'answer',
          sdp: answer.sdp,
          ...(answer.nvstSdp ? {nvstSdp: answer.nvstSdp} : {}),
        }),
      },
      ackid: this.nextAckId(),
    });
  }

  sendIceCandidate(candidate: GfnIceCandidate): void {
    // Drop TCP candidates — GFN media is UDP only.
    if (candidate.candidate.trim().split(/\s+/)[2]?.toLowerCase() === 'tcp') {
      return;
    }
    this.sendJson({
      peer_msg: {
        from: this.peerId,
        to: this.remotePeerId,
        msg: JSON.stringify({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment,
        }),
      },
      ackid: this.nextAckId(),
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      try {
        socket.close();
      } catch {}
    }
  }
}
