import {getNpsso, getCachedOnlineId, setCachedOnlineId} from './auth';
import {psPlusChiaki} from './native';

// The signed-in account's PSN online ID: the remembered one when it was read
// for this same npsso, otherwise asked of the native lib (two HTTPS requests)
// and remembered. Null when signed out or when it can't be read -- callers
// just show nothing then.
export const loadPsPlusOnlineId = async (): Promise<string | null> => {
  const npsso = getNpsso();
  if (!npsso) {
    return null;
  }
  const cached = getCachedOnlineId(npsso);
  if (cached) {
    return cached;
  }
  try {
    const onlineId = await psPlusChiaki.fetchOnlineId(npsso);
    if (onlineId) {
      setCachedOnlineId(npsso, onlineId);
      return onlineId;
    }
  } catch {}
  return null;
};
