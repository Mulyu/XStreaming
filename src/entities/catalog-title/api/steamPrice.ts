import {NativeModules} from 'react-native';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('steamPrice');

const {CatalogSteamPriceModule} = NativeModules;

export type SteamPriceInfo = {
  currencyCode: string;
  initial: number; // minor units (e.g. cents), pre-discount
  final: number; // minor units, current buyable price
  discountPercent: number;
};

// Fetch Steam store prices for a batch of app ids. Never rejects -- a failed
// or free-to-play/unlisted app is simply omitted from the result.
//
// The actual fetch (batching, capped concurrency -- one attempt per chunk,
// no retry, same as before) now runs natively -- see
// android/.../java/com/xstreaming/catalog/SteamPriceClient.kt -- so this is
// just the bridge call; the dedup step and the empty-input fast path stay
// here to avoid a pointless bridge round trip.
export const fetchSteamPrices = async (
  appIds: string[],
  cc = 'US',
  language = 'english',
): Promise<Record<string, SteamPriceInfo>> => {
  const ids = Array.from(
    new Set((appIds || []).filter(id => typeof id === 'string' && id)),
  );
  if (ids.length === 0) {
    return {};
  }
  try {
    const result = await CatalogSteamPriceModule?.fetchPrices(
      ids,
      cc,
      language,
    );
    return result ?? {};
  } catch (e) {
    log.info('fetchSteamPrices failed:', e);
    return {};
  }
};

export const isSteamSaleForDisplay = (info?: SteamPriceInfo | null): boolean =>
  !!info && info.discountPercent > 0;
