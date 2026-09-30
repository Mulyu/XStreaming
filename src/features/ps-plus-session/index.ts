// Public API for the ps-plus-session feature (PSN npsso auth, the unified
// cloud catalog fetch, and driving one PS Plus cloud-streaming session --
// provisioning, starting the native chiaki session, polling controller
// input into it, and tearing it down). Consumers import from here, not from
// api/ directly.
export {getNpsso, setNpsso, clearNpsso, isPsPlusSignedIn} from './api/auth';
export {fetchUnifiedCatalog, CloudCategory} from './api/catalog';
export type {CloudGame, UnifiedCatalogResult} from './api/catalog';
export {PsPlusSession, gpStateToPsPlusInput} from './api/streamAdapter';
export {default as PsPlusStreamView} from './ui/PsPlusStreamView';
export type {
  PsPlusLaunchOptions,
  PsPlusConnectionState,
  PsPlusAdapterHandlers,
} from './api/streamAdapter';
export {
  psPlusChiaki,
  VideoResolutionPreset,
  VideoFPSPreset,
  Codec,
  ControllerButton,
} from './api/native';
export type {
  PsPlusServiceType,
  CloudProvisionOptions,
  CloudProvisionResult,
  StartSessionOptions,
  StreamMetrics,
  ControllerStateInput,
  PsPlusSessionEvent,
  PsPlusProvisionProgress,
} from './api/native';
