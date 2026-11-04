import axios from 'axios';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('xboxContentAccess');

// The relying party Xbox's content-access service takes tokens for (the web
// player asks for it by this name).
export const CONTENT_ACCESS_RELYING_PARTY = 'http://mp.microsoft.com/';

const CONTENT_ACCESS_URL = 'https://contentaccess.exp.xboxservices.com/all/v1';

// ---- A minimal protobuf reader ------------------------------------------
// The service answers in protobuf, and only a few fields of it are wanted, so
// this reads just the wire format rather than pulling in a library.

type Field = {
  no: number;
  wire: number;
  value: number;
  // The low 32 bits of a varint, signed (an int32 sent as -1 is a 10-byte
  // varint, far beyond what a JS number holds exactly).
  int32: number;
  bytes?: Uint8Array;
};

const readVarint = (
  buf: Uint8Array,
  pos: number,
): {value: number; int32: number; next: number} => {
  // Up to 10 bytes. `value` loses precision beyond 2^53 (epoch times and
  // lengths come nowhere near); `int32` is exact for the int32 fields.
  let value = 0;
  let scale = 1;
  let low = 0;
  let next = pos;
  for (let i = 0; i < 10; i++) {
    if (next >= buf.length) {
      throw new Error('truncated varint');
    }
    const byte = buf[next++];
    value += (byte & 0x7f) * scale;
    if (i < 5) {
      low |= (byte & 0x7f) << (7 * i);
    }
    if (!(byte & 0x80)) {
      return {value, int32: low | 0, next};
    }
    scale *= 128;
  }
  throw new Error('varint too long');
};

const readFields = (buf: Uint8Array): Field[] => {
  const fields: Field[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.next;
    const no = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      pos = v.next;
      fields.push({no, wire, value: v.value, int32: v.int32});
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      pos = len.next;
      if (pos + len.value > buf.length) {
        throw new Error('truncated field');
      }
      fields.push({
        no,
        wire,
        value: 0,
        int32: 0,
        bytes: buf.subarray(pos, pos + len.value),
      });
      pos += len.value;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
  }
  return fields;
};

// ---- ContentAccessProto.StreamingGameplayData ---------------------------

export type TimerResetFrequency =
  | 'unknown'
  | 'never'
  | 'daily'
  | 'weekly'
  | 'monthly';

const RESET_FREQUENCY: TimerResetFrequency[] = [
  'unknown',
  'never',
  'daily',
  'weekly',
  'monthly',
];

export type StreamingGameplayTime = {
  remainingSeconds: number;
  maxSeconds: number;
  // Epoch seconds the remaining time was last updated at (0 when not given).
  lastUpdated: number;
  resetFrequency: TimerResetFrequency;
};

const decodeGameplayTime = (buf: Uint8Array): StreamingGameplayTime => {
  const time: StreamingGameplayTime = {
    remainingSeconds: 0,
    maxSeconds: 0,
    lastUpdated: 0,
    resetFrequency: 'unknown',
  };
  for (const f of readFields(buf)) {
    if (f.wire !== 0) {
      continue;
    }
    if (f.no === 2) {
      time.remainingSeconds = f.int32;
    } else if (f.no === 3) {
      time.lastUpdated = f.value;
    } else if (f.no === 4) {
      time.maxSeconds = f.int32;
    } else if (f.no === 5) {
      time.resetFrequency = RESET_FREQUENCY[f.value] ?? 'unknown';
    }
  }
  return time;
};

// ---- ContentAccessProto.StreamingProgramData ----------------------------

export type StreamingProgramData = {
  // Time that comes back on a schedule (the monthly allowance) and time that
  // does not (bought hours), both without ads; and time with ads.
  periodicAdFree?: StreamingGameplayTime;
  persistentAdFree?: StreamingGameplayTime;
  adSupported?: StreamingGameplayTime;
};

const decodeProgramData = (buf: Uint8Array): StreamingProgramData => {
  const data: StreamingProgramData = {};
  for (const f of readFields(buf)) {
    if (f.wire !== 2 || !f.bytes) {
      continue;
    }
    if (f.no === 2) {
      data.periodicAdFree = decodeGameplayTime(f.bytes);
    } else if (f.no === 3) {
      data.persistentAdFree = decodeGameplayTime(f.bytes);
    } else if (f.no === 4) {
      data.adSupported = decodeGameplayTime(f.bytes);
    }
  }
  return data;
};

// ContentAccessAllV1Response field 3 is a map<puid, StreamingProgramData>: the
// account-level streaming time. A map entry is a message of {1: key, 2: value}.
// The first account in it is the signed-in one (the web player does the same).
export const decodeAccountStreamingTime = (
  bytes: Uint8Array,
): StreamingProgramData | null => {
  for (const f of readFields(bytes)) {
    if (f.no !== 3 || f.wire !== 2 || !f.bytes) {
      continue;
    }
    for (const entry of readFields(f.bytes)) {
      if (entry.no === 2 && entry.wire === 2 && entry.bytes) {
        return decodeProgramData(entry.bytes);
      }
    }
  }
  return null;
};

// ---- What Settings shows ------------------------------------------------

// Time left of one kind. The service sends -1 for "no limit".
export type TimeLeft = {unlimited: true} | {unlimited: false; seconds: number};

export type StreamingTimeSummary = {
  // Time without ads: the monthly allowance plus any bought time.
  adFree: TimeLeft;
  // Time with ads (what a game bought outside Game Pass plays with); absent
  // when the account has none.
  adSupported?: TimeLeft;
};

const timeLeft = (times: StreamingGameplayTime[]): TimeLeft => {
  if (times.some(t => t.remainingSeconds < 0)) {
    return {unlimited: true};
  }
  return {
    unlimited: false,
    seconds: times.reduce((sum, t) => sum + t.remainingSeconds, 0),
  };
};

// null when the account carries no streaming time at all.
export const summarizeStreamingTime = (
  data: StreamingProgramData | null,
): StreamingTimeSummary | null => {
  if (!data) {
    return null;
  }
  const adFree = [data.periodicAdFree, data.persistentAdFree].filter(
    (t): t is StreamingGameplayTime => !!t,
  );
  if (adFree.length === 0 && !data.adSupported) {
    return null;
  }
  return {
    adFree: timeLeft(adFree),
    adSupported: data.adSupported ? timeLeft([data.adSupported]) : undefined,
  };
};

// Asks the service for the signed-in account's streaming time. `token` is an
// XSTS token for CONTENT_ACCESS_RELYING_PARTY. null when the answer carries no
// account-level streaming time; a failed request throws. The endpoint is
// reverse-engineered from the web player.
export const fetchStreamingTime = async (
  token: {token: string; userHash: string},
  market: string,
  offering = 'xgpuweb',
): Promise<StreamingProgramData | null> => {
  if (!token.token || !token.userHash) {
    throw new Error('missing token');
  }
  const res = await axios.get(CONTENT_ACCESS_URL, {
    params: {market, offering},
    headers: {
      Authorization: `XBL3.0 x=${token.userHash};${token.token}`,
      'Calling-App-Name': 'Xbox Cloud Gaming Web',
      // Required: without a correlation vector the service answers 400.
      'MS-CV': '0',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  let data: StreamingProgramData | null;
  try {
    data = decodeAccountStreamingTime(new Uint8Array(res.data));
  } catch (e: any) {
    // The service answered, but not in the shape expected.
    throw new Error(`decode: ${e?.message ?? e}`);
  }
  log.info('streaming time:', JSON.stringify(data));
  return data;
};
