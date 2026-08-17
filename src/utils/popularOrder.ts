import axios from 'axios';
import {debugFactory} from './debug';

const log = debugFactory('popularOrder');

// The "Most popular on cloud" Game Pass collection — the same list that backs
// https://play.xbox.com/gallery/popular. sigls returns an ordered list of
// product ids (by usage/popularity); no auth required.
const POPULAR_SIGL_ID = '6a589fa0-d493-472b-8e20-3813699d7056';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';

// Fetch the popularity-ordered Store ids (uppercased). The first array element
// is collection metadata, not a product, so it's skipped. Resolves to [] on
// any failure — callers fall back to their default order.
export const fetchPopularOrder = async (
  market = 'US',
  language = 'en-US',
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
    // Index 0 is the collection metadata ({siglId,title,...}); products follow.
    return data
      .slice(1)
      .map((entry: any) => entry?.id)
      .filter((id: any) => typeof id === 'string' && id)
      .map((id: string) => id.toUpperCase());
  } catch (e) {
    log.info('fetchPopularOrder failed:', e);
    return [];
  }
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
