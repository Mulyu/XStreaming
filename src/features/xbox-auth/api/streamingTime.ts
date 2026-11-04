import {
  CONTENT_ACCESS_RELYING_PARTY,
  fetchStreamingTime,
  remainingStreamingSeconds,
} from '../../../entities/xbox-token';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('xboxStreamingTime');

// "token 401 (XErr 2148916233)" / "request 403" / "decode: ..." -- short enough
// to show on the row, enough to tell which service said no.
const describeFailure = (step: string, error: any): string => {
  const status = error?.response?.status;
  const xerr = error?.response?.data?.XErr;
  if (status) {
    return `${step} ${status}${xerr ? ` (XErr ${xerr})` : ''}`;
  }
  const message = String(error?.message ?? error ?? '');
  return message.startsWith('decode') ? message : `${step}: ${message}`;
};

// What Settings shows for the account's cloud gaming time.
export type StreamingTimeResult =
  // Seconds left; null when the account carries no streaming time (no limit
  // applies to it, as far as the service says).
  | {ok: true; seconds: number | null}
  // `reason` says which step failed and how (shown next to the failure).
  | {ok: false; reason?: string};

// Settings re-reads on every focus; the figure moves slowly.
const CACHE_MS = 2 * 60 * 1000;
let cached: {at: number; key: string; result: StreamingTimeResult} | null =
  null;

// The signed-in Xbox account's remaining cloud gaming time. `authentication`
// is the app's Authentication / MsalAuthentication object (it lives in Redux);
// `market` is the store market, e.g. "JP". Never rejects.
export const loadStreamingTime = async (
  authentication: any,
  market: string,
  now = Date.now(),
): Promise<StreamingTimeResult> => {
  const key = market;
  if (cached && cached.key === key && now - cached.at < CACHE_MS) {
    return cached.result;
  }
  let step = 'token';
  try {
    const store = authentication?._tokenStore;
    const method = store?.getAuthenticationMethod?.();
    let xsts: any;
    if (method === 'msal' && authentication._msal) {
      xsts = await authentication._msal.getTokenForRelyingParty(
        CONTENT_ACCESS_RELYING_PARTY,
      );
    } else if (authentication?._xal) {
      xsts = await authentication._xal.getTokenForRelyingParty(
        store,
        CONTENT_ACCESS_RELYING_PARTY,
      );
    } else {
      return {ok: false, reason: 'no sign-in'};
    }
    step = 'request';
    const data = await fetchStreamingTime(
      {
        token: xsts?.data?.Token,
        userHash: xsts?.data?.DisplayClaims?.xui?.[0]?.uhs,
      },
      market,
    );
    const result: StreamingTimeResult = {
      ok: true,
      seconds: remainingStreamingSeconds(data),
    };
    cached = {at: now, key, result};
    return result;
  } catch (e) {
    log.info('loadStreamingTime failed:', step, e);
    return {ok: false, reason: describeFailure(step, e)};
  }
};
