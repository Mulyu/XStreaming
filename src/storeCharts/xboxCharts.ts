// Microsoft/Xbox Store chart pages. There's no REST "top charts" API (the
// documented Store APIs -- storeedgefd's pages/searchResults, DisplayCatalog
// -- are search/product-lookup only), but the public marketing site's own
// chart pages (microsoft.com/{locale}/store/{top-paid|top-free|new}/games/
// xbox) server-render each ranked product as a self-contained JSON object
// alongside its markup. Confirmed live: each page embeds ~50 objects shaped
// like {compName:"Product Cards: Games", productId, title, image, price,
// pdpUri, ...}, in rank order, in the requested locale (title/price
// included). Scraped, not a documented API -- parsed defensively so a
// layout change degrades to an empty chart, not a crash.
import {storage} from '../store/mmkv';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Each product's JSON object is self-contained and ends with the "inStock"
// field, whatever comes before it (description text, badges, ...) -- matching
// up to there rather than trying to balance braces keeps this a single
// regex instead of a hand-rolled parser.
const ITEM_RE =
  /\{"compName":"Product Cards: Games".*?"inStock":(?:true|false)\}/g;

export type XboxChartKind = 'topPaid' | 'topFree' | 'new';

const CHART_SLUG: Record<XboxChartKind, string> = {
  topPaid: 'top-paid',
  topFree: 'top-free',
  new: 'new',
};

export type XboxChartEntry = {
  productId: string;
  title: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  storeUrl?: string;
};

const cacheKey = (kind: XboxChartKind, locale: string): string =>
  `store.xboxChart.${kind}.${locale}`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h -- a chart moves slowly

const parseChartHtml = (html: string): XboxChartEntry[] => {
  const entries: XboxChartEntry[] = [];
  const matches = html.match(ITEM_RE) ?? [];
  for (const raw of matches) {
    try {
      const item = JSON.parse(raw);
      if (!item?.productId || !item?.title) {
        continue;
      }
      entries.push({
        productId: item.productId,
        title: item.title,
        imageUrl: item.image?.uri || undefined,
        price: item.price?.currentPrice || undefined,
        originalPrice: item.price?.originalPrice || undefined,
        storeUrl: item.pdpUri || undefined,
      });
    } catch {
      // Malformed/unexpected shape for this one entry -- skip it, not the
      // whole chart.
    }
  }
  return entries;
};

// Cached list if still fresh, else null.
export const getFreshXboxChart = (
  kind: XboxChartKind,
  locale: string,
): XboxChartEntry[] | null => {
  const raw = storage.getString(cacheKey(kind, locale));
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
      return parsed.entries as XboxChartEntry[];
    }
  } catch {}
  return null;
};

// Fetch + parse a Microsoft Store Xbox chart page. `locale` is a
// lowercase "language-COUNTRY" tag the Store site itself uses as a URL
// segment (e.g. "ja-jp", "en-us"). Returns [] on any failure rather than
// throwing -- a chart that can't load should just show empty, not break
// the screen.
export const fetchXboxChart = async (
  kind: XboxChartKind,
  locale = 'en-us',
): Promise<XboxChartEntry[]> => {
  const url = `https://www.microsoft.com/${locale}/store/${CHART_SLUG[kind]}/games/xbox`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {'User-Agent': USER_AGENT, Accept: 'text/html'},
    });
    if (!res.ok) {
      return [];
    }
    html = await res.text();
  } catch {
    return [];
  }
  const entries = parseChartHtml(html);
  if (entries.length > 0) {
    try {
      storage.set(
        cacheKey(kind, locale),
        JSON.stringify({ts: Date.now(), entries}),
      );
    } catch {}
  }
  return entries;
};
