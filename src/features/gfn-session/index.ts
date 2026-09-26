// Public API for the gfn-session feature (establishing and driving a
// GeForce NOW WebRTC streaming session -- device-code-authorized session
// creation/polling/teardown, region/subscription lookups, the WebRTC
// transport with its own SDP/signaling helpers and gesture tracking, and the
// GfnStreamAdapter that makes all of it look like xCloud's own webRTCClient
// so NativeStream can drive either with the same UI). Consumers outside this
// slice import from here, not from api/ or lib/ directly.
export {
  DEFAULT_GFN_SETTINGS,
  fetchGfnRegions,
  fetchGfnVpcId,
  fetchGfnSubscription,
  createGfnSession,
  pollGfnSession,
  stopGfnSession,
  launchGfnSession,
} from './api/session';
export type {
  GfnIceServer,
  GfnStreamSettings,
  GfnSession,
  GfnRegionOption,
  GfnSubscriptionInfo,
  GfnLaunchProgress,
} from './api/session';

export {GfnStreamAdapter, gpStateToGfnInput} from './api/streamAdapter';
