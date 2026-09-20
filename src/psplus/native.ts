import {NativeModules, NativeEventEmitter} from 'react-native';

// Thin wrapper over the Android PsPlusChiaki native module (see
// android/app/src/main/java/com/xstreaming/psplus/PsPlusModule.kt), which
// bridges chiaki-ng/Pylux's vendored cloud-streaming engine (android/chiaki/
// at the repo root -- AGPL-3.0, OpenSSL exception, see /COPYING). Android
// only for now -- there is no iOS build of the vendored native library yet.
const PsPlusChiakiNative = NativeModules.PsPlusChiaki;

export type PsPlusServiceType = 'pscloud' | 'psnow';

export type CloudProvisionOptions = {
  serviceType: PsPlusServiceType;
  gameIdentifier: string;
  gameName: string;
  npsso: string;
  storeCountry: string;
  storeLang: string;
  gameLanguage: string;
  ownedEntitlementId?: string;
  ownedPlatform?: string;
  forcedDatacenter?: string;
  priorDatacentersJson?: string;
  catalogIsForeign?: boolean;
  /** VideoResolutionPreset value (1=360p, 2=540p, 3=720p, 4=1080p). */
  resolution?: number;
  bitrateKbps?: number;
};

export type CloudProvisionResult = {
  err: number;
  serverIp: string;
  serverPort: number;
  handshakeKey: string;
  launchSpec: string;
  sessionId: string;
  entitlementId: string;
  platform: string;
  psnWrapperType: number;
  mtuIn: number;
  mtuOut: number;
  rttMs: number;
  datacenterPings: string;
  errorMessage: string;
};

// VideoResolutionPreset (lib/include/chiaki/... via Chiaki.kt).
export const VideoResolutionPreset = {
  RES_360P: 1,
  RES_540P: 2,
  RES_720P: 3,
  RES_1080P: 4,
} as const;

// VideoFPSPreset.
export const VideoFPSPreset = {
  FPS_30: 30,
  FPS_60: 60,
} as const;

// Codec.
export const Codec = {
  CODEC_H264: 0,
  CODEC_H265: 1,
  CODEC_H265_HDR: 2,
} as const;

export type StartSessionOptions = {
  serviceType: PsPlusServiceType;
  serverIp: string;
  serverPort: number;
  handshakeKey: string;
  launchSpec: string;
  sessionId: string;
  psnWrapperType?: number;
  mtuIn?: number;
  mtuOut?: number;
  rttMs?: number;
  resolutionPreset: number;
  fpsPreset: number;
  codec: number;
};

export type StreamMetrics = {
  bitrateMbps: number;
  packetLoss: number;
  droppedFrames: number;
  fps: number;
  rttMs: number;
  width: number;
  height: number;
};

export type ControllerStateInput = {
  buttons?: number;
  l2State?: number;
  r2State?: number;
  leftX?: number;
  leftY?: number;
  rightX?: number;
  rightY?: number;
};

// ControllerState.BUTTON_* bit values (see Chiaki.kt).
export const ControllerButton = {
  CROSS: 1 << 0,
  MOON: 1 << 1,
  BOX: 1 << 2,
  PYRAMID: 1 << 3,
  DPAD_LEFT: 1 << 4,
  DPAD_RIGHT: 1 << 5,
  DPAD_UP: 1 << 6,
  DPAD_DOWN: 1 << 7,
  L1: 1 << 8,
  R1: 1 << 9,
  L3: 1 << 10,
  R3: 1 << 11,
  OPTIONS: 1 << 12,
  SHARE: 1 << 13,
  TOUCHPAD: 1 << 14,
  PS: 1 << 15,
} as const;

export type PsPlusSessionEvent =
  | {type: 'connected'}
  | {type: 'loginPinRequest'; pinIncorrect: boolean}
  | {type: 'quit'; reason: number; reasonString?: string}
  | {type: 'rumble'; left: number; right: number}
  | {type: 'psChord'};

export type PsPlusProvisionProgress = {stage: string};

class PsPlusChiakiClient {
  private emitter = new NativeEventEmitter();

  get isAvailable(): boolean {
    return !!PsPlusChiakiNative;
  }

  initNativeSsl(): void {
    PsPlusChiakiNative?.initNativeSsl?.();
  }

  provisionCloudSession(
    options: CloudProvisionOptions,
  ): Promise<CloudProvisionResult> {
    return PsPlusChiakiNative.provisionCloudSession(options);
  }

  fetchCatalog(
    npsso: string | undefined,
    locale: string | undefined,
    forceRefresh: boolean,
  ): Promise<string> {
    return PsPlusChiakiNative.fetchCatalog(npsso, locale, forceRefresh);
  }

  invalidateCatalogCache(): void {
    PsPlusChiakiNative?.invalidateCatalogCache?.();
  }

  startSession(options: StartSessionOptions): Promise<void> {
    return PsPlusChiakiNative.startSession(options);
  }

  stopSession(): Promise<void> {
    return PsPlusChiakiNative.stopSession();
  }

  setControllerState(state: ControllerStateInput): void {
    PsPlusChiakiNative?.setControllerState?.(state);
  }

  setLoginPin(pin: string): void {
    PsPlusChiakiNative?.setLoginPin?.(pin);
  }

  getMetrics(): Promise<StreamMetrics | null> {
    return PsPlusChiakiNative.getMetrics();
  }

  addSessionEventListener(
    handler: (event: PsPlusSessionEvent) => void,
  ): () => void {
    const sub = this.emitter.addListener('PsPlusSessionEvent', handler);
    return () => sub.remove();
  }

  addProvisionProgressListener(
    handler: (event: PsPlusProvisionProgress) => void,
  ): () => void {
    const sub = this.emitter.addListener('PsPlusProvisionProgress', handler);
    return () => sub.remove();
  }
}

export const psPlusChiaki = new PsPlusChiakiClient();
