// Steam Store charts. store.steampowered.com/api/featuredcategories is a
// clean public JSON endpoint, but its top_sellers/new_releases lists are tiny
// (10 / 30 titles) -- fine as a highlight strip, too short to survive
// filtering down to titles that are also on GFN. The same
// store/search/results endpoint the Steam Store's own search page calls
// returns a much deeper, still-unauthenticated list (confirmed live: 8,993
// matches for a plain "topsellers" filter) -- as an HTML fragment rather than
// JSON, but each result's markup is regular enough to pull apart without a
// DOM parser. Same public-API family as appdetails, already used by
// utils/steamPrice.ts.
import axios from 'axios';
import {storage} from '../../../shared/lib/mmkv';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('steamCharts');

const SEARCH_URL = 'https://store.steampowered.com/search/results/';

export type SteamChartKind = 'topsellers' | 'new';

export type SteamChartEntry = {
  appId: string;
  title: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  discountPercent?: number;
};

export type SteamChartPage = {
  entries: SteamChartEntry[];
  totalCount?: number;
};

const cacheKey = (kind: SteamChartKind, cc: string): string =>
  `store.steamChart.${kind}.${cc}`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h, same as the Xbox chart cache

// Only the first page is worth caching for an instant paint -- deeper pages
// are fetched live as the user scrolls, and matches against GFN's much
// smaller catalog get sparse fast (a "new releases" scan needs hundreds of
// entries to find even one GFN title), so there's little reuse value in
// caching them.
export const STEAM_CHART_PAGE_SIZE = 100;

// Row boundary: every result is its own <a href="https://store.steampowered.
// com/app/<id>/...">...</a>. Splitting on the href prefix and reading each
// chunk up to the next one is simpler and more robust than balancing tags.
const ROW_SPLIT = '<a href="https://store.steampowered.com/app/';

export const parseResultsHtml = (html: string): SteamChartEntry[] => {
  const rows = html.split(ROW_SPLIT).slice(1);
  const entries: SteamChartEntry[] = [];
  for (const row of rows) {
    const idMatch = /^(\d+)/.exec(row);
    const titleMatch = /<span class="title">([^<]+)<\/span>/.exec(row);
    if (!idMatch || !titleMatch) {
      continue;
    }
    const imageMatch = /<img src="([^"]+)"/.exec(row);
    const finalMatch = /discount_final_price[^"]*">([^<]+)<\/div>/.exec(row);
    const originalMatch = /discount_original_price">([^<]+)<\/div>/.exec(row);
    const pctMatch = /discount_pct">-?(\d+)%<\/div>/.exec(row);
    entries.push({
      appId: idMatch[1],
      title: titleMatch[1],
      imageUrl: imageMatch?.[1],
      price: finalMatch?.[1],
      originalPrice: originalMatch?.[1],
      discountPercent: pctMatch ? Number(pctMatch[1]) : undefined,
    });
  }
  return entries;
};

export const getFreshSteamChart = (
  kind: SteamChartKind,
  cc: string,
): SteamChartEntry[] | null => {
  const raw = storage.getString(cacheKey(kind, cc));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.entries) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < CACHE_TTL_MS
    ) {
      return parsed.entries as SteamChartEntry[];
    }
  } catch {}
  return null;
};

// Fetch + parse one page of a Steam Store chart. "topsellers" mirrors the
// store's own Top Sellers tab; "new" sorts by release date descending the
// same way its New Releases tab does. `cc` genuinely drives a region-specific
// ranking (confirmed live: cc=JP's top 10 barely overlaps cc=US's), so this
// mirrors what browsing the Store from that country would show. category1=998
// restricts both to actual games (excludes DLC/soundtracks/software), which
// matters a lot for "new": unfiltered, roughly half of Released_DESC's ~225k
// entries aren't games at all, and every one of them is guaranteed to miss
// GFN's catalog. os=win narrows to Windows-compatible titles -- the only kind
// GFN's cloud PCs can run -- though live testing shows it barely moves the
// top ranks themselves. Even filtered, a fresh Steam release lands on GFN
// weeks to months later at best, so a handful of pages can easily come back
// with zero matches -- the caller pages deeper via `start` until it finds
// enough or gives up, rather than treating an empty first page as failure.
// Returns [] on any failure.
export const fetchSteamChart = async (
  kind: SteamChartKind,
  cc = 'US',
  language = 'english',
  start = 0,
  count = STEAM_CHART_PAGE_SIZE,
): Promise<SteamChartPage> => {
  const params: Record<string, string> = {
    query: '',
    start: String(start),
    count: String(count),
    dynamic_data: '',
    infinite: '1',
    cc,
    l: language,
    category1: '998',
    os: 'win',
  };
  if (kind === 'topsellers') {
    params.filter = 'topsellers';
  } else {
    params.sort_by = 'Released_DESC';
  }

  let html: string;
  let totalCount: number | undefined;
  try {
    const res = await axios.get(SEARCH_URL, {params, timeout: 15000});
    html = res?.data?.results_html;
    totalCount =
      typeof res?.data?.total_count === 'number'
        ? res.data.total_count
        : undefined;
    if (typeof html !== 'string') {
      return {entries: []};
    }
  } catch (e) {
    log.info('fetchSteamChart failed:', e);
    return {entries: []};
  }

  const entries = parseResultsHtml(html);
  if (start === 0 && entries.length > 0) {
    try {
      storage.set(
        cacheKey(kind, cc),
        JSON.stringify({ts: Date.now(), entries}),
      );
    } catch {}
  }
  return {entries, totalCount};
};
