import {
  psPlusChiaki,
  ControllerButton,
  ControllerStateInput,
  TOUCHPAD_WIDTH,
  TOUCHPAD_HEIGHT,
  CloudProvisionOptions,
  StartSessionOptions,
  VideoResolutionPreset,
  VideoFPSPreset,
  Codec,
  PsPlusSessionEvent,
} from './native';
import i18next from '../../../i18n';
import {createNexusTouchpadCombo} from '../lib/nexusTouchpadCombo';
import type {LoadingPhase} from '../../../shared/lib/loadingPhase';

const {t} = i18next;

// The native provisioning flow (cloudsession_kamaji.c for PSNOW,
// cloudsession_gaikai.c for PSCloud) reports progress as ~15 fine-grained,
// untranslated, technical stage strings ("Pinging Datacenters - Step 8 of
// 10", "Allocating streaming slot - Queue position: 3 - Attempt 2", ...).
// Showing those raw strings in the same overlay xCloud/GFN use (which
// already condenses their own richer internal states down to one short,
// localized line) would be far more verbose than either provider's -- so
// fold them into the same 5-phase ladder (shared/lib/loadingPhase) those
// providers use, and report one short localized summary per phase instead
// of the raw string. The full raw string keeps flowing into the PS Plus
// debug log untouched (see PsPlusModule.kt's addProvisionProgressListener),
// so nothing is lost for diagnosing a stuck connect -- it's just not what
// the player sees. Matched by substring, not exact string, since several
// stages carry interpolated text (a datacenter name, a retry/attempt
// count, a queue position) that a fixed lookup table would miss; stages
// this doesn't recognize fall back to 'handshake', the earliest phase.
const mapProvisionStageToPhase = (
  stage: string,
): {phase: LoadingPhase; text: string} => {
  if (stage.includes('Datacenter')) {
    return {phase: 'negotiating', text: t('PsPlusLaunchNegotiating')};
  }
  if (stage.includes('Allocat') || stage.includes('Migrating')) {
    return {phase: 'starting', text: t('PsPlusLaunchStarting')};
  }
  return {phase: 'handshake', text: t('PsPlusLaunchHandshake')};
};

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
  // Nexus (the button the on-screen gamepad draws in that spot, and a
  // physical controller's home key) is the touchpad click: a standalone PS
  // press does nothing in a cloud session (Sony's backend has no OS shell for
  // an ephemeral single-game session -- see usePsPlusStream's OPTIONS+SHARE
  // chord). Nexus + D-pad is a touchpad swipe instead; see
  // lib/nexusTouchpadCombo.ts, applied per input tick before this mapping.
  ['Nexus', ControllerButton.TOUCHPAD],
  // Physical controllers with a separate touchpad-click key (KEYCODE_BUTTON_C,
  // see entities/gamepad's GAMEPAD_MAPING) and the on-screen pad's press-and-
  // hold land on the same bit.
  ['Touchpad', ControllerButton.TOUCHPAD],
];

const num = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);

const normalizeAxisToInt16 = (value: number): number =>
  Math.max(-32768, Math.min(32767, Math.round(value * 32767)));

const normalizeTriggerToUint8 = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value * 255)));

// Convert an xCloud/native-stream-style gpState object into chiaki's
// ControllerState input shape.
// gpState.Touches is [{id, x, y}] with x/y normalized to 0..1 across the
// touchpad; ids stay the same for the life of one touch.
const touchesToPsPlusInput = (
  touches: any,
): {id: number; x: number; y: number}[] =>
  (Array.isArray(touches) ? touches : []).slice(0, 2).map((t: any) => ({
    id: Math.round(num(t?.id)) & 0x7f,
    x: Math.round(Math.max(0, Math.min(1, num(t?.x))) * (TOUCHPAD_WIDTH - 1)),
    y: Math.round(Math.max(0, Math.min(1, num(t?.y))) * (TOUCHPAD_HEIGHT - 1)),
  }));

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
    // Unlike XInput/Moonlight (xCloud's and GFN's streamAdapters negate this
    // same gpState field for exactly that reason -- see Packet/index.ts and
    // gfn-session/api/streamAdapter.ts), a real DualShock/DualSense reports
    // its left stick Y HID axis screen-down positive already, matching
    // gpState's own convention -- no negation here. Confirmed by an actual
    // in-game report of inverted up/down after this file copied the negated
    // xCloud/GFN formula verbatim without accounting for that difference.
    leftY: normalizeAxisToInt16(num(gp?.LeftThumbYAxis)),
    rightX: normalizeAxisToInt16(num(gp?.RightThumbXAxis)),
    rightY: normalizeAxisToInt16(num(gp?.RightThumbYAxis)),
    touches: touchesToPsPlusInput(gp?.Touches),
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
  /** Forces a specific Gaikai datacenter instead of auto-selecting one (see
   * cloudsession_gaikai.c's gk_step11/12) -- empty/unset picks whichever
   * datacenter measured the lowest RTT, with no RTT quality gate. */
  forcedDatacenter?: string;
  /** Prior run(s)' measured datacenter pings (Gaikai's own ping-results
   * JSON), merged into this run's picker so a datacenter that isn't probed
   * this time doesn't disappear from it. */
  priorDatacentersJson?: string;
  /** Initial per-session volume (0..1) -- see native.ts's setAudioGain(). */
  audioGain?: number;
};

export type PsPlusConnectionState =
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'failed';

export type PsPlusAdapterHandlers = {
  onState?: (state: PsPlusConnectionState, detail?: string) => void;
  // text is a short, localized, already-summarized line -- see
  // mapProvisionStageToPhase's own comment for why the raw native stage
  // string itself isn't passed through.
  onProgress?: (text: string, phase: LoadingPhase) => void;
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
  private nexusCombo = createNexusTouchpadCombo();

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
          const {phase, text} = mapProvisionStageToPhase(event.stage);
          this.handlers.onProgress?.(text, phase);
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
      // Safe as soon as the native Session exists (before this even
      // resolves, technically): the AudioOutput struct is created in
      // sessionCreate(), well before the Oboe stream itself is opened, and
      // set_gain() is just an atomic store applied on the next output
      // callback -- see audio-output.h's own comment.
      if (options.audioGain != null) {
        psPlusChiaki.setAudioGain(options.audioGain);
      }
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
        psPlusChiaki.setControllerState(
          gpStateToPsPlusInput(this.nexusCombo.apply(this.gpState, Date.now())),
        );
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

  setAudioGain(gain: number): void {
    psPlusChiaki.setAudioGain(gain);
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
