// Public API for the xcloud-session feature (establishing and maintaining an
// xCloud/xHome WebRTC streaming session -- start, SDP/ICE exchange, keepalive,
// stop). Split out of the old xCloud/index.ts god-class, which mixed this
// with unrelated catalog-browsing methods; see entities/catalog-title's
// XcloudCatalogApi for those. Consumers outside this slice import from here,
// not from api/xcloudSessionClient directly.
export {default as XcloudSessionClient} from './api/xcloudSessionClient';
