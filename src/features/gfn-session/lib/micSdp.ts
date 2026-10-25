// Finds the microphone line in GeForce NOW's WebRTC offer. The official web
// client sends the mic over the same peer connection, on an audio m-line the
// server offers as receive-only; the game audio m-line is send-only. Picking
// the "first audio transceiver" would grab the game audio, so the mic line is
// identified from the offer's SDP instead.

export type SdpMedia = {
  // Position among the offer's m-lines, matching the transceiver order.
  index: number;
  kind: string;
  mid: string | null;
  // The offerer's direction ('' when the section declares none).
  direction: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive' | '';
  rtpmaps: string[];
  fmtps: string[];
  ptime: string | null;
};

const DIRECTIONS = ['sendrecv', 'sendonly', 'recvonly', 'inactive'] as const;

export const parseSdpMedia = (sdp: string): SdpMedia[] => {
  const sections: SdpMedia[] = [];
  let current: SdpMedia | null = null;
  for (const raw of sdp.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('m=')) {
      current = {
        index: sections.length,
        kind: line.slice(2).split(' ')[0],
        mid: null,
        direction: '',
        rtpmaps: [],
        fmtps: [],
        ptime: null,
      };
      sections.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith('a=mid:')) {
      current.mid = line.slice('a=mid:'.length);
    } else if (line.startsWith('a=rtpmap:')) {
      current.rtpmaps.push(line.slice('a=rtpmap:'.length));
    } else if (line.startsWith('a=fmtp:')) {
      current.fmtps.push(line.slice('a=fmtp:'.length));
    } else if (line.startsWith('a=ptime:')) {
      current.ptime = line.slice('a=ptime:'.length);
    } else {
      const dir = DIRECTIONS.find(d => line === `a=${d}`);
      if (dir) {
        current.direction = dir;
      }
    }
  }
  return sections;
};

// The audio section the server offers for receiving our microphone: a
// receive-only audio line, else the audio line OpenNOW found carrying it
// (mid "3") when the server leaves it inactive.
export const findMicSection = (media: SdpMedia[]): SdpMedia | null => {
  const audio = media.filter(m => m.kind === 'audio');
  return (
    audio.find(m => m.direction === 'recvonly') ??
    audio.find(m => m.mid === '3' && m.direction === 'inactive') ??
    null
  );
};

// One line per m-section for the debug log: enough to see what the server
// offered for the microphone without dumping the whole SDP.
export const describeMedia = (media: SdpMedia[]): string =>
  media
    .map(
      m =>
        `#${m.index} ${m.kind} mid=${m.mid} dir=${m.direction || '-'}` +
        ` ptime=${m.ptime ?? '-'} [${m.rtpmaps.join(' | ')}]` +
        (m.fmtps.length ? ` fmtp[${m.fmtps.join(' | ')}]` : ''),
    )
    .join('\n');
