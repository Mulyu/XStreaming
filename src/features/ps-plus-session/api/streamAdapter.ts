import {
  psPlusChiaki,
  ControllerButton,
  ControllerStateInput,
  CloudProvisionOptions,
  StartSessionOptions,
  VideoResolutionPreset,
  VideoFPSPreset,
  Codec,
  PsPlusSessionEvent,
} from './native';

// xCloud/native-stream-style gpState button field -> chiaki ControllerState
// bit value (see native.ts's ControllerButton and Chiaki.kt's ControllerState).
const BUTTON_MAP: Array<[string, number]> = [
  ['A', ControllerButton.CROSS],
  ['B', ControllerButton.MOON],
  ['X', ControllerButton.BOX],
  ['Y', ControllerButton.PYRAMID],
  ['LeftShoulder', ControllerButton.L1],
  ['RightShoulder', ControllerButton.R1],
  ['View', ControllerButton.SHARE],
  ['Menu', ControllerButton.OPTIONS],
  ['LeftThumb', ControllerButton.L3],
  ['RightThumb', ControllerButton.R3],
  ['DPadUp', ControllerButton.DPAD_UP],
  ['DPadDown', ControllerButton.DPAD_DOWN],
  ['DPadLeft', ControllerButton.DPAD_LEFT],
  ['DPadRight', ControllerButton.DPAD_RIGHT],
  ['Nexus', ControllerButton.PS],
];

const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);

const normalizeAxisToInt16 = (value: number): number =>
  Math.max(-32768, Math.min(32767, Math.round(value * 32767)));

const normalizeTriggerToUint8 = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value * 255)));

// Convert an xCloud/native-stream-style gpState object into chiaki's
// ControllerState input shape.
export const gpStateToPsPlusInput = (gp: any): ControllerStateInput => {
  let buttons = 0;
  for (const [key, mask] of BUTTON_MAP) {
    if (gp?.[key]) {
      buttons |= mask;
    }
  }
  return {
    buttons,
    l2State: normalizeTriggerToUint8(num(gp?.LeftTrigger)),
    r2State: normalizeTriggerToUint8(num(gp?.RightTrigger)),
    leftX: normalizeAxisToInt16(num(gp?.LeftThumbXAxis)),
    // gpState sticks are screen-down positive; DualSense wants up positive.
    leftY: normalizeAxisToInt16(-num(gp?.LeftThumbYAxis)),
    rightX: normalizeAxisToInt16(num(gp?.RightThumbXAxis)),
    rightY: normalizeAxisToInt16(-num(gp?.RightThumbYAxis)),
  };
};

export type PsPlusLaunchOptions = {
  npsso: string;
  serviceType: 'pscloud' | 'psnow';
  gameIdentifier: string;
  gameName: string;
  storeCountry?: string;
  storeLang?: string;
  gameLanguage?: string;
  ownedEntitlementId?: string;
  ownedPlatform?: string;
  resolution?: number;
  fpsPreset?: number;
  bitrateKbps?: number;
  /** Forces a specific Gaikai datacenter, bypassing the 80ms auto-select
   * ping gate entirely (see cloudsession_gaikai.c's gk_step11/12) -- empty/
   * unset picks the lowest-measured-RTT datacenter under that gate. */
  forcedDatacenter?: string;
  /** Prior run(s)' measured datacenter pings (Gaikai's own ping-results
   * JSON), merged into this run's picker so a datacenter that isn't probed
   * this time doesn't disappear from it. */
  priorDatacentersJson?: string;
};

export type PsPlusConnectionState =
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'failed';

export type PsPlusAdapterHandlers = {
  onState?: (state: PsPlusConnectionState, detail?: string) => void;
  onProgress?: (stage: string) => void;
  onLoginPinRequest?: (pinIncorrect: boolean) => void;
  onRumble?: (left: number, right: number) => void;
  onPsChord?: () => void;
  /** Fired once the provisioning call returns, success or failure, whenever
   * it carried a non-empty datacenter-pings list -- lets the caller persist
   * it (see PsPlusLaunchOptions.priorDatacentersJson) for the Settings
   * datacenter picker and future runs. */
  onDatacenterPings?: (json: string) => void;
};

// Drives one PS Plus cloud-streaming session end to end: provisioning
// (Kamaji/Gaikai allocation) -> starting the native chiaki session -> polling
// controller input into it -> tearing it down. Deliberately not shaped like
// GfnStreamAdapter/xCloud's webRTCClient (setTrackHandler etc.) since PS Plus
// renders through its own native SurfaceView (see this slice's own
// ui/PsPlusStreamView.tsx) rather than a WebRTC MediaStreamTrack -- there is
// no RTCView-compatible video path to adapt into.
export class PsPlusSession {
  private disposed = false;
  private removeSessionListener: (() => void) | null = null;
  private removeProgressListener: (() => void) | null = null;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private gpState: any = null;

  constructor(private readonly handlers: PsPlusAdapterHandlers) {}

  async connect(options: PsPlusLaunchOptions): Promise<void> {
    if (!psPlusChiaki.isAvailable) {
      this.handlers.onState?.('failed', 'PS Plus native module unavailable');
      return;
    }
    psPlusChiaki.initNativeSsl();

    this.removeProgressListener = psPlusChiaki.addProvisionProgressListener(
      event => {
        if (!this.disposed) {
          this.handlers.onProgress?.(event.stage);
        }
      },
    );

    const provisionOptions: CloudProvisionOptions = {
      serviceType: options.serviceType,
      gameIdentifier: options.gameIdentifier,
      gameName: options.gameName,
      npsso: options.npsso,
      storeCountry: options.storeCountry ?? 'US',
      storeLang: options.storeLang ?? 'en',
      gameLanguage: options.gameLanguage ?? 'en',
      ownedEntitlementId: options.ownedEntitlementId,
      ownedPlatform: options.ownedPlatform,
      resolution: options.resolution ?? VideoResolutionPreset.RES_1080P,
      bitrateKbps: options.bitrateKbps ?? 15000,
      forcedDatacenter: options.forcedDatacenter,
      priorDatacentersJson: options.priorDatacentersJson,
    };

    let provisioned;
    try {
      provisioned = await psPlusChiaki.provisionCloudSession(provisionOptions);
    } catch (e: any) {
      if (!this.disposed) {
        this.handlers.onState?.(
          'failed',
          e?.message ? String(e.message) : String(e),
        );
      }
      return;
    }
    if (this.disposed) {
      return;
    }
    // Carried on both success and failure -- a failed ping-gate rejection is
    // exactly the case where a fresh measurement matters most for the
    // Settings datacenter picker.
    if (provisioned.datacenterPings) {
      this.handlers.onDatacenterPings?.(provisioned.datacenterPings);
    }
    if (provisioned.err !== 0) {
      this.handlers.onState?.(
        'failed',
        provisioned.errorMessage || `provision error ${provisioned.err}`,
      );
      return;
    }

    this.removeSessionListener = psPlusChiaki.addSessionEventListener(event =>
      this.handleSessionEvent(event),
    );

    const startOptions: StartSessionOptions = {
      serviceType: options.serviceType,
      serverIp: provisioned.serverIp,
      serverPort: provisioned.serverPort,
      handshakeKey: provisioned.handshakeKey,
      launchSpec: provisioned.launchSpec,
      sessionId: provisioned.sessionId,
      psnWrapperType: provisioned.psnWrapperType,
      mtuIn: provisioned.mtuIn,
      mtuOut: provisioned.mtuOut,
      rttMs: provisioned.rttMs,
      resolutionPreset: options.resolution ?? VideoResolutionPreset.RES_1080P,
      fpsPreset: options.fpsPreset ?? VideoFPSPreset.FPS_60,
      codec: Codec.CODEC_H265,
    };

    try {
      await psPlusChiaki.startSession(startOptions);
    } catch (e: any) {
      if (!this.disposed) {
        this.handlers.onState?.(
          'failed',
          e?.message ? String(e.message) : String(e),
        );
      }
    }
  }

  private handleSessionEvent(event: PsPlusSessionEvent): void {
    if (this.disposed) {
      return;
    }
    switch (event.type) {
      case 'connected':
        this.startInputLoop();
        this.handlers.onState?.('connected');
        break;
      case 'quit':
        this.stopInputLoop();
        this.handlers.onState?.('closed', event.reasonString || undefined);
        break;
      case 'loginPinRequest':
        this.handlers.onLoginPinRequest?.(event.pinIncorrect);
        break;
      case 'rumble':
        this.handlers.onRumble?.(event.left, event.right);
        break;
      case 'psChord':
        this.handlers.onPsChord?.();
        break;
    }
  }

  private startInputLoop(): void {
    if (this.inputTimer) {
      return;
    }
    // Matches native-stream's own default virtual-gamepad polling rate.
    this.inputTimer = setInterval(() => {
      if (this.gpState) {
        psPlusChiaki.setControllerState(gpStateToPsPlusInput(this.gpState));
      }
    }, 16);
  }

  private stopInputLoop(): void {
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = null;
    }
  }

  setGamepadState(gpState: any): void {
    this.gpState = gpState;
  }

  setLoginPin(pin: string): void {
    psPlusChiaki.setLoginPin(pin);
  }

  getMetrics() {
    return psPlusChiaki.getMetrics();
  }

  close(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopInputLoop();
    this.removeSessionListener?.();
    this.removeSessionListener = null;
    this.removeProgressListener?.();
    this.removeProgressListener = null;
    psPlusChiaki.stopSession().catch(() => {});
  }
}
