import {describeMedia, findMicSection, parseSdpMedia} from '../micSdp';

const OFFER = [
  'v=0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=mid:0',
  'a=sendonly',
  'a=rtpmap:96 H264/90000',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=mid:1',
  'a=sendonly',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=mid:2',
  'a=recvonly',
  'a=ptime:10',
  'a=rtpmap:111 opus/48000/2',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'a=mid:3',
].join('\r\n');

describe('micSdp', () => {
  it('parses every m-line with its mid and direction', () => {
    const media = parseSdpMedia(OFFER);
    expect(media.map(m => [m.kind, m.mid, m.direction])).toEqual([
      ['video', '0', 'sendonly'],
      ['audio', '1', 'sendonly'],
      ['audio', '2', 'recvonly'],
      ['application', '3', ''],
    ]);
    expect(media[2].ptime).toBe('10');
    expect(media[1].fmtps).toEqual(['111 minptime=10;useinbandfec=1']);
  });

  it('picks the receive-only audio line, not the game audio', () => {
    const mic = findMicSection(parseSdpMedia(OFFER));
    expect(mic?.mid).toBe('2');
    expect(mic?.index).toBe(2);
  });

  it('falls back to an inactive audio line with mid 3', () => {
    const sdp = ['m=audio 9 X 111', 'a=mid:3', 'a=inactive'].join('\n');
    expect(findMicSection(parseSdpMedia(sdp))?.mid).toBe('3');
  });

  it('finds nothing when the offer has no mic line', () => {
    const sdp = ['m=audio 9 X 111', 'a=mid:1', 'a=sendonly'].join('\n');
    expect(findMicSection(parseSdpMedia(sdp))).toBeNull();
  });

  it('describes the sections for the log', () => {
    expect(describeMedia(parseSdpMedia(OFFER))).toContain(
      '#2 audio mid=2 dir=recvonly ptime=10',
    );
  });
});
