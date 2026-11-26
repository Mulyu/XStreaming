// Public API for the xcloud-session feature (establishing and maintaining an
// xCloud/xHome WebRTC streaming session -- start, SDP/ICE exchange, keepalive,
// stop). Split out of the old xCloud/index.ts god-class, which mixed this
// with unrelated catalog-browsing methods; see entities/catalog-title's
// XcloudCatalogApi for those. Consumers outside this slice import from here,
// not from api/xcloudSessionClient or lib/webrtc directly.
export {default as XcloudSessionClient} from './api/xcloudSessionClient';

// The WebRTC data-channel transport that carries an already-negotiated
// xCloud/xHome session -- GFN has its own separate client
// (features/gfn-session's lib/webrtcClient.ts/nativeWebRtcClient.ts), so
// this is xcloud-session's own concern, not a shared transport.
//
// webRTCClient now resolves to the Kotlin-native client (lib/webrtc-native)
// -- same public shape as the original JS client (lib/webrtc), which stays
// in the tree unused-but-present (its Channel/Control.ts and Channel/
// Message.ts are still imported and reused unchanged by the native client)
// rather than deleted, same precedent as GFN's own webrtcClient.ts.
//
// legacyWebRTCClient is the original JS implementation, still exported so
// NativeStream can fall back to it when the 'xcloud_native_webrtc' setting
// is off -- an escape hatch in case the native client misbehaves on a given
// device (see the black-screen bug this setting was added to work around).
export {default as webRTCClient} from './lib/webrtc-native';
export {default as legacyWebRTCClient} from './lib/webrtc';
export type {PointerWireData} from './lib/webrtc/Channel/Input';

export {
  SYSTEM_UI_TARGET_GAME_TIME,
  SYSTEM_UI_TYPE_GAME_TIME,
} from './model/gameTime';
export {useGameTimeWarnings} from './model/useGameTimeWarnings';
