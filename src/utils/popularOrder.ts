import axios from 'axios';
import {debugFactory} from './debug';
import {delay} from './storePrice';

const log = debugFactory('popularOrder');

// The "Most popular on cloud" Game Pass collection — the same list that backs
// https://play.xbox.com/gallery/popular. sigls returns an ordered list of
// product ids (by usage/popularity); no auth required.
const POPULAR_SIGL_ID = '6a589fa0-d493-472b-8e20-3813699d7056';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';

// Returns the ordered ids, or null on a transient failure (so the caller can
// tell "this market has no list" from "the request failed" and only retry the
// latter).
const fetchPopularOrderOnce = async (
  market: string,
  language: string,
): Promise<string[] | null> => {
  try {
    const res = await axios.get(SIGLS_URL, {
      params: {
        id: POPULAR_SIGL_ID,
        market,
        language,
        deviceFamily: 'Windows.Xbox',
      },
      headers: {Accept: 'application/json'},
      timeout: 15000,
    });
    const data = res?.data;
    if (!Array.isArray(data)) {
      return [];
    }
    // The leading collection-metadata element ({siglId,title,...}) has no `id`,
    // so filtering on a string id drops it without assuming its position.
    return data
      .map((entry: any) => entry?.id)
      .filter((id: any) => typeof id === 'string' && id)
      .map((id: string) => id.toUpperCase());
  } catch (e) {
    log.info('fetchPopularOrder failed:', e);
    return null;
  }
};

// Fetch the popularity-ordered Store ids (uppercased), retrying with backoff so
// a single transient failure doesn't disable the sort. Returns the list (which
// may be a legitimately empty []) on success, or null when every attempt failed
// — so the caller can negative-cache an empty market but retry a real failure.
export const fetchPopularOrder = async (
  market = 'US',
  language = 'en-US',
  attempts = 3,
  baseDelayMs = 10000,
): Promise<string[] | null> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = await fetchPopularOrderOnce(market, language);
    if (order !== null) {
      return order; // success (possibly a legitimate empty list)
    }
    if (attempt < attempts - 1) {
      await delay(baseDelayMs * Math.pow(2, attempt));
    }
  }
  return null;
};

// Build a productId -> rank (0-based) map for fast sorting.
export const buildPopularRank = (order: string[]): Record<string, number> => {
  const rank: Record<string, number> = {};
  order.forEach((id, index) => {
    if (rank[id] === undefined) {
      rank[id] = index;
    }
  });
  return rank;
};
