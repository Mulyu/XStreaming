import {PARTIALLY_RELIABLE_GAMEPAD_MASK_ALL} from './inputEncoding';

// Builds the "nvstSdp" blob GFN expects alongside the WebRTC answer. It carries
// the stream configuration (resolution, fps, bitrate, codec) plus the local ICE
// credentials, and is what actually drives the server-side encoder. Ported from
// OpenNOW's nvstOffer.ts, trimmed to the 60fps H264/H265 profile a phone uses.

const OFFICIAL_MIN_BITRATE_KBPS = 4000;
const HID_DEVICE_MASK_ALL = 0x7fffffff;

export type NvstParams = {
  width: number;
  height: number;
  fps: number;
  maxBitrateKbps: number;
  partialReliableThresholdMs: number;
  codec: 'H264' | 'H265' | 'AV1';
  credentials: {ufrag: string; pwd: string; fingerprint: string};
};

// Extract ICE ufrag/pwd and the DTLS fingerprint from a local SDP.
export const extractIceCredentials = (
  sdp: string,
): {ufrag: string; pwd: string; fingerprint: string} => {
  const ufrag = /a=ice-ufrag:(.*)/.exec(sdp)?.[1]?.trim() ?? '';
  const pwd = /a=ice-pwd:(.*)/.exec(sdp)?.[1]?.trim() ?? '';
  const fingerprint = /a=fingerprint:(.*)/.exec(sdp)?.[1]?.trim() ?? '';
  return {ufrag, pwd, fingerprint};
};

export const buildNvstSdp = (params: NvstParams): string => {
  const maxBitrate = Math.max(
    OFFICIAL_MIN_BITRATE_KBPS,
    Math.floor(params.maxBitrateKbps),
  );
  const startupBitrate = Math.max(
    OFFICIAL_MIN_BITRATE_KBPS,
    Math.round(maxBitrate / 4),
  );

  const lines: string[] = [
    'v=0',
    'o=SdpTest test_id_13 14 IN IPv4 127.0.0.1',
    's=-',
    't=0 0',
    `a=general.icePassword:${params.credentials.pwd}`,
    `a=general.iceUserNameFragment:${params.credentials.ufrag}`,
    `a=general.dtlsFingerprint:${params.credentials.fingerprint}`,
    'm=video 0 RTP/AVP',
    'a=msid:fbc-video-0',
    'a=vqos.fec.rateDropWindow:10',
    'a=vqos.fec.minRequiredFecPackets:2',
    'a=vqos.drc.minRequiredBitrateCheckEnabled:1',
    'a=vqos.fec.repairMinPercent:5',
    'a=vqos.fec.repairPercent:5',
    'a=vqos.fec.repairMaxPercent:35',
    'a=vqos.dynamicStreamingMode:3',
    'a=vqos.bllFec.enable:0',
    // 60fps profile: only drc.enable:1 (mode-3, non-high-fps).
    'a=vqos.drc.enable:1',
    'a=video.dx9EnableNv12:1',
    'a=video.dx9EnableHdr:1',
    'a=vqos.qpg.enable:1',
    'a=vqos.resControl.qp.qpg.featureSetting:7',
    'a=bwe.useOwdCongestionControl:1',
    'a=video.enableRtpNack:1',
    'a=vqos.bw.txRxLag.minFeedbackTxDeltaMs:200',
    'a=vqos.drc.bitrateIirFilterFactor:18',
    'a=video.packetSize:1140',
    'a=packetPacing.minNumPacketsPerGroup:15',
    'a=vqos.adjustStreamingFpsDuringOutOfFocus:1',
    'a=vqos.resControl.cpmRtc.ignoreOutOfFocusWindowState:1',
    'a=vqos.resControl.perfHistory.rtcIgnoreOutOfFocusWindowState:1',
    'a=vqos.resControl.cpmRtc.featureMask:3',
    'a=packetPacing.numGroups:5',
    'a=packetPacing.maxDelayUs:1000',
    'a=packetPacing.minNumPacketsFrame:10',
    'a=video.rtpNackQueueLength:1024',
    'a=video.rtpNackQueueMaxPackets:512',
    'a=video.rtpNackMaxPacketCount:25',
    `a=video.clientViewportWd:${params.width}`,
    `a=video.clientViewportHt:${params.height}`,
    `a=video.maxFPS:${params.fps}`,
    `a=video.initialBitrateKbps:${startupBitrate}`,
    `a=video.initialPeakBitrateKbps:${startupBitrate}`,
    `a=vqos.bw.maximumBitrateKbps:${maxBitrate}`,
    `a=vqos.bw.minimumBitrateKbps:${OFFICIAL_MIN_BITRATE_KBPS}`,
    'a=video.maxNumReferenceFrames:4',
    'a=video.mapRtpTimestampsToFrames:1',
    'a=video.encoderCscMode:3',
    'a=video.encoderHdrCscMode:4',
    'a=video.dynamicRangeMode:0',
    'a=video.bitDepth:8',
    'a=video.scalingFeature1:0',
    'a=video.prefilterParams.prefilterMode:0',
    'a=video.prefilterParams.prefilterModel:0',
    'a=video.prefilterParams.denoiseLevel:0',
    'a=video.prefilterParams.sharpnessLevel:0',
    // Audio track (receive-only from server).
    'm=audio 0 RTP/AVP',
    'a=msid:audio',
    // Mic track (declared even though we do not send yet).
    'm=mic 0 RTP/AVP',
    'a=msid:mic',
    'a=rtpmap:0 PCMU/8000',
    // Input/application track.
    'm=application 0 RTP/AVP',
    'a=msid:input_1',
    `a=ri.partialReliableThresholdMs:${params.partialReliableThresholdMs}`,
    `a=ri.hidDeviceMask:${HID_DEVICE_MASK_ALL}`,
    `a=ri.enablePartiallyReliableTransferGamepad:${PARTIALLY_RELIABLE_GAMEPAD_MASK_ALL}`,
    `a=ri.enablePartiallyReliableTransferHid:${HID_DEVICE_MASK_ALL}`,
    '',
  ];

  return lines.join('\n');
};
