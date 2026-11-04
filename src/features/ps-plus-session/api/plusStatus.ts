import {storage} from '../../../shared/lib/mmkv';
import {getNpsso} from './auth';
import {psPlusChiaki} from './native';

// The state of the account's PS Plus membership, as the native lib reads it from
// the purchase history: 'lapsed' only when Plus entitlements exist and none is
// active. Anything else -- including a failed read, or no Plus entitlements at
// all -- is 'unknown', which the Library treats as active so a read that
// fails never dims a working library.
export type PlusStatus = 'unknown' | 'active' | 'lapsed';

export const plusStatusFromCode = (code: unknown): PlusStatus =>
  code === 1 ? 'active' : code === 2 ? 'lapsed' : 'unknown';

const KEY = 'psplus.membership';
export const PLUS_STATUS_TTL_MS = 60 * 60 * 1000;

type Cached = {npsso: string; status: PlusStatus; ts: number};

const read = (npsso: string | undefined): Cached | null => {
  if (!npsso) {
    return null;
  }
  try {
    const parsed = JSON.parse(storage.getString(KEY) || 'null');
    return parsed && parsed.npsso === npsso && typeof parsed.ts === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

export const clearPlusStatus = (): void => {
  try {
    storage.delete(KEY);
  } catch {}
};

// Whether the membership counts as running right now: everything but a
// remembered 'lapsed' for the signed-in account.
export const isPsPlusMembershipActive = (): boolean =>
  read(getNpsso())?.status !== 'lapsed';

// Reads the state (at most once an hour), remembers it with the npsso it was
// read for, and returns it. A read that comes back unknown keeps the previous
// answer rather than flipping a lapsed account to active for an hour.
export const loadPsPlusMembership = async (
  now: number = Date.now(),
): Promise<PlusStatus> => {
  const npsso = getNpsso();
  if (!npsso) {
    return 'unknown';
  }
  const cached = read(npsso);
  if (cached && now - cached.ts < PLUS_STATUS_TTL_MS) {
    return cached.status;
  }
  let status: PlusStatus = 'unknown';
  try {
    status = plusStatusFromCode(await psPlusChiaki.fetchPlusStatus(npsso));
  } catch {}
  if (status === 'unknown' && cached) {
    status = cached.status;
  }
  try {
    storage.set(KEY, JSON.stringify({npsso, status, ts: now}));
  } catch {}
  return status;
};
