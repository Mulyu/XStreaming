// Public API for the xcloud-session feature (establishing and maintaining an
// xCloud/xHome WebRTC streaming session -- start, SDP/ICE exchange, keepalive,
// stop). Split out of the old xCloud/index.ts god-class, which mixed this
// with unrelated catalog-browsing methods; see entities/catalog-title's
// XcloudCatalogApi for those. Consumers outside this slice import from here,
// not from api/xcloudSessionClient or lib/webrtc directly.
export {default as XcloudSessionClient} from './api/xcloudSessionClient';

// The WebRTC data-channel transport (input/control/chat/message channels,
// gamepad driver, packet encoding) that carries an already-negotiated
// xCloud/xHome session -- GFN has its own separate client (gfn/webrtcClient.ts),
// so this is xcloud-session's own concern, not a shared transport.
export {default as webRTCClient} from './lib/webrtc';
export type {PointerWireData} from './lib/webrtc/Channel/Input';
