// Shared phase vocabulary for the stream-connecting overlay (see
// components/StreamHandshakeOverlay.tsx). Both the xCloud connect chain and
// the GFN adapter's onProgress report into this same small set of phases, so
// the overlay shows one consistent progress ladder for either provider
// instead of a page of vendor-specific WebRTC log lines.
export type LoadingPhase =
  | 'queue'
  | 'handshake'
  | 'negotiating'
  | 'starting'
  | 'live';
