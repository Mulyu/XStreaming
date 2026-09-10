import axios from 'axios';
import {debugFactory} from './debug';

const log = debugFactory('steamPrice');

// Steam's public Store API. No key, no auth -- confirmed live: a single call
// accepts a comma-joined batch of appids and returns each one's
// price_overview (which already reflects any active discount).
const APPDETAILS_URL = 'https://store.steampowered.com/api/appdetails';

// Undocumented, but batching keeps well under the community-reported
// ~200 req/5min per-IP throttle even for a title with many Steam-linked
// GFN store variants (there's only ever a handful per title in practice).
const BATCH_SIZE = 20;

export type SteamPriceInfo = {
  currencyCode: string;
  initial: number; // minor units (e.g. cents), pre-discount
  final: number; // minor units, current buyable price
  discountPercent: number;
};

// Fetch Steam store prices for a batch of app ids. Never rejects -- a failed
// or free-to-play/unlisted app is simply omitted from the result.
export const fetchSteamPrices = async (
  appIds: string[],
  cc = 'US',
  language = 'english',
): Promise<Record<string, SteamPriceInfo>> => {
  const ids = Array.from(
    new Set((appIds || []).filter(id => typeof id === 'string' && id)),
  );
  const result: Record<string, SteamPriceInfo> = {};
  if (ids.length === 0) {
    return result;
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await axios.get(APPDETAILS_URL, {
          params: {
            appids: chunk.join(','),
            cc,
            l: language,
            filters: 'price_overview',
          },
          timeout: 15000,
        });
        const data = res?.data;
        chunk.forEach(id => {
          const entry = data?.[id];
          const overview = entry?.data?.price_overview;
          if (entry?.success && overview) {
            result[id] = {
              currencyCode: overview.currency || '',
              initial: overview.initial ?? overview.final ?? 0,
              final: overview.final ?? 0,
              discountPercent: overview.discount_percent ?? 0,
            };
          }
        });
      } catch (e) {
        log.info('fetchSteamPrices batch failed:', e);
      }
    }),
  );

  return result;
};

export const isSteamSaleForDisplay = (info?: SteamPriceInfo | null): boolean =>
  !!info && info.discountPercent > 0;
