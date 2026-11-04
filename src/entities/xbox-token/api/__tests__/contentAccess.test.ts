import {
  decodeAccountStreamingTime,
  summarizeStreamingTime,
} from '../contentAccess';

// A tiny protobuf encoder, enough to build the service's answer.
const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n;
  while (v >= 128) {
    out.push(v % 128 | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
};
const vField = (no: number, n: number) => [...varint(no * 8), ...varint(n)];
const lField = (no: number, bytes: number[]) => [
  ...varint(no * 8 + 2),
  ...varint(bytes.length),
  ...bytes,
];
const str = (s: string) => Array.from(s).map(c => c.charCodeAt(0));

const gameplay = (
  remaining: number,
  max: number,
  freq: number,
  updated = 1793780000,
) => [
  ...vField(1, 3),
  ...vField(2, remaining),
  ...vField(3, updated),
  ...vField(4, max),
  ...vField(5, freq),
];

// ContentAccessAllV1Response{3: {puid: StreamingProgramData}}
const response = (program: number[], extraBefore: number[] = []) =>
  new Uint8Array([
    ...extraBefore,
    ...lField(3, [
      ...lField(1, str('2533274876470851')),
      ...lField(2, program),
    ]),
  ]);

describe('decodeAccountStreamingTime', () => {
  it('reads the three kinds of streaming time of the account', () => {
    const data = decodeAccountStreamingTime(
      response([
        ...lField(2, gameplay(36000, 54000, 4)),
        ...lField(3, gameplay(7200, 7200, 1)),
        ...lField(4, gameplay(1800, 1800, 2)),
      ]),
    );
    expect(data?.periodicAdFree).toEqual({
      remainingSeconds: 36000,
      maxSeconds: 54000,
      lastUpdated: 1793780000,
      resetFrequency: 'monthly',
    });
    expect(data?.persistentAdFree?.resetFrequency).toBe('never');
    expect(data?.adSupported?.remainingSeconds).toBe(1800);
  });

  it('skips fields before the streaming time (and ones it does not know)', () => {
    const passes = lField(1, [...lField(1, str('puid')), ...lField(2, [])]);
    const data = decodeAccountStreamingTime(
      response(lField(2, gameplay(60, 100, 4)), passes),
    );
    expect(data?.periodicAdFree?.remainingSeconds).toBe(60);
  });

  it('is null when the answer has no account-level streaming time', () => {
    expect(
      decodeAccountStreamingTime(new Uint8Array(lField(1, str('x')))),
    ).toBeNull();
    expect(decodeAccountStreamingTime(new Uint8Array([]))).toBeNull();
  });

  it('throws on a cut-off message instead of returning nonsense', () => {
    const whole = Array.from(response(lField(2, gameplay(60, 100, 4))));
    expect(() =>
      decodeAccountStreamingTime(new Uint8Array(whole.slice(0, 12))),
    ).toThrow();
  });
});

// An int32 of -1 goes on the wire as a 10-byte varint.
const NEGATIVE_ONE = [
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01,
];
const vNeg = (no: number) => [...varint(no * 8), ...NEGATIVE_ONE];

describe('a real answer (an account without Game Pass)', () => {
  // What the service sent for an account whose ad-free time is used up and
  // whose ad-supported time has no limit: -1 remaining, -1 maximum.
  const answer = response([
    ...lField(2, [...vField(3, 1793790672), ...vField(5, 1)]),
    ...lField(3, [...vField(3, 1793790672), ...vField(5, 1)]),
    ...lField(4, [
      ...vNeg(2),
      ...vField(3, 1793790672),
      ...vNeg(4),
      ...vField(5, 1),
    ]),
  ]);

  it('reads -1 as -1', () => {
    const data = decodeAccountStreamingTime(answer);
    expect(data?.adSupported?.remainingSeconds).toBe(-1);
    expect(data?.adSupported?.maxSeconds).toBe(-1);
    expect(data?.periodicAdFree?.remainingSeconds).toBe(0);
  });

  it('summarizes it as no ad-free time and unlimited time with ads', () => {
    expect(summarizeStreamingTime(decodeAccountStreamingTime(answer))).toEqual({
      adFree: {unlimited: false, seconds: 0},
      adSupported: {unlimited: true},
    });
  });
});

describe('summarizeStreamingTime', () => {
  const t = (remainingSeconds: number) => ({
    remainingSeconds,
    maxSeconds: 0,
    lastUpdated: 0,
    resetFrequency: 'monthly' as const,
  });

  it('adds up the ad-free time (monthly allowance plus bought time)', () => {
    expect(
      summarizeStreamingTime({
        periodicAdFree: t(3600),
        persistentAdFree: t(1800),
        adSupported: t(900),
      }),
    ).toEqual({
      adFree: {unlimited: false, seconds: 5400},
      adSupported: {unlimited: false, seconds: 900},
    });
  });

  it('calls ad-free time with a -1 unlimited', () => {
    expect(summarizeStreamingTime({periodicAdFree: t(-1)})?.adFree).toEqual({
      unlimited: true,
    });
  });

  it('leaves out the kind the account does not have', () => {
    expect(summarizeStreamingTime({adSupported: t(600)})).toEqual({
      adFree: {unlimited: false, seconds: 0},
      adSupported: {unlimited: false, seconds: 600},
    });
    expect(
      summarizeStreamingTime({periodicAdFree: t(60)})?.adSupported,
    ).toBeUndefined();
  });

  it('is null when the account carries no streaming time', () => {
    expect(summarizeStreamingTime({})).toBeNull();
    expect(summarizeStreamingTime(null)).toBeNull();
  });
});
