import {
  decodeAccountStreamingTime,
  remainingStreamingSeconds,
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

describe('remainingStreamingSeconds', () => {
  const t = (remainingSeconds: number) => ({
    remainingSeconds,
    maxSeconds: 0,
    lastUpdated: 0,
    resetFrequency: 'monthly' as const,
  });

  it('adds up the ad-free time (monthly allowance plus bought time)', () => {
    expect(
      remainingStreamingSeconds({
        periodicAdFree: t(3600),
        persistentAdFree: t(1800),
        adSupported: t(99999),
      }),
    ).toBe(5400);
  });

  it('falls back to the ad-supported time, and to null with none', () => {
    expect(remainingStreamingSeconds({adSupported: t(900)})).toBe(900);
    expect(remainingStreamingSeconds({})).toBeNull();
    expect(remainingStreamingSeconds(null)).toBeNull();
  });

  it('ignores a negative (unset) figure', () => {
    expect(
      remainingStreamingSeconds({periodicAdFree: t(-1), adSupported: t(600)}),
    ).toBe(600);
  });

  it('reports zero as zero', () => {
    expect(remainingStreamingSeconds({periodicAdFree: t(0)})).toBe(0);
  });
});
