import {NativeModules} from 'react-native';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('popularOrder');

const {CatalogPopularOrderModule} = NativeModules;

// Fetch the popularity-ordered Store ids (uppercased) for the "Most popular
// on cloud" Game Pass collection (no auth required), retrying with backoff
// so a single transient failure doesn't disable the sort. Returns the list
// (which may be a legitimately empty []) on success, or null when every
// attempt failed — so the caller can negative-cache an empty market but
// retry a real failure.
//
// The fetch+parse+retry itself now runs natively -- see
// android/.../java/com/xstreaming/catalog/PopularOrderClient.kt.
export const fetchPopularOrder = async (
  market = 'US',
  language = 'en-US',
  attempts = 3,
  baseDelayMs = 10000,
): Promise<string[] | null> => {
  try {
    const order = await CatalogPopularOrderModule?.fetchOrder(
      market,
      language,
      attempts,
      baseDelayMs,
    );
    return order ?? null;
  } catch (e) {
    log.info('fetchPopularOrder failed:', e);
    return null;
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
