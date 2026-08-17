import axios from 'axios';
import {debugFactory} from './debug';

const log = debugFactory('popularOrder');

// The "Most popular on cloud" Game Pass collection — the same list that backs
// https://play.xbox.com/gallery/popular. sigls returns an ordered list of
// product ids (by usage/popularity); no auth required.
const POPULAR_SIGL_ID = '6a589fa0-d493-472b-8e20-3813699d7056';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const fetchPopularOrderOnce = async (
  market: string,
  language: string,
): Promise<string[]> => {
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
    return [];
  }
};

// Fetch the popularity-ordered Store ids (uppercased), retrying with backoff so
// a single transient failure doesn't disable the sort. Resolves to [] only when
// every attempt fails — callers then fall back to their default order.
export const fetchPopularOrder = async (
  market = 'US',
  language = 'en-US',
  attempts = 3,
  baseDelayMs = 10000,
): Promise<string[]> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = await fetchPopularOrderOnce(market, language);
    if (order.length > 0) {
      return order;
    }
    if (attempt < attempts - 1) {
      await delay(baseDelayMs * Math.pow(2, attempt));
    }
  }
  return [];
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
