import axios from 'axios';
import {debugFactory} from './debug';
import {delay} from './storePrice';

const log = debugFactory('leavingSoon');

// The official "Leaving soon" Game Pass collection — the same list that backs
// https://www.xbox.com/play/gallery/leaving-soon. It holds the titles that
// exit the library within roughly two weeks. Same no-auth sigls mechanism as
// the popularity list; returns Store big-ids (which, for xCloud titles, equal
// the productId).
const LEAVING_SOON_SIGL_ID = '393f05bf-e596-4ef6-9487-6d4fa0eab987';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';

// Returns the leaving-soon Store ids (uppercased), or null on a transient
// failure (so the caller can tell "this market has none" — a legitimately
// empty list — from "the request failed" and only retry the latter).
const fetchLeavingSoonOnce = async (
  market: string,
  language: string,
): Promise<string[] | null> => {
  try {
    const res = await axios.get(SIGLS_URL, {
      params: {
        id: LEAVING_SOON_SIGL_ID,
        market,
        language,
        deviceFamily: 'Windows.Xbox',
      },
      headers: {Accept: 'application/json'},
      timeout: 15000,
    });
    const data = res?.data;
    if (!Array.isArray(data)) {
      // Unexpected shape (e.g. a 200 error body) — retry, don't treat as empty.
      return null;
    }
    // The leading collection-metadata element ({siglId,title,...}) has no `id`,
    // so filtering on a string id drops it without assuming its position.
    return data
      .map((entry: any) => entry?.id)
      .filter((id: any) => typeof id === 'string' && id)
      .map((id: string) => id.toUpperCase());
  } catch (e) {
    log.info('fetchLeavingSoon failed:', e);
    return null;
  }
};

// Fetch the leaving-soon Store ids, retrying with backoff so a single
// transient failure doesn't disable the badge. Returns the list (possibly a
// legitimately empty []) on success, or null when every attempt failed.
export const fetchLeavingSoon = async (
  market = 'US',
  language = 'en-US',
  attempts = 3,
  baseDelayMs = 10000,
): Promise<string[] | null> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ids = await fetchLeavingSoonOnce(market, language);
    if (ids !== null) {
      return ids; // success (possibly a legitimate empty list)
    }
    if (attempt < attempts - 1) {
      await delay(baseDelayMs * Math.pow(2, attempt));
    }
  }
  return null;
};

// Build a Set of uppercase Store ids for fast membership checks.
export const buildLeavingSoonSet = (ids: string[]): Set<string> => new Set(ids);
