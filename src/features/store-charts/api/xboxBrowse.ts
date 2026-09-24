// Xbox.com's own "Browse games" page (xbox.com/{locale}/games/browse) is
// backed by a real, deeply-paginated search API -- unlike the marketing
// site's fixed-50-item chart pages this module used to scrape. Found by
// reverse-engineering the page's own JS bundle (client.*.js): the request
// body's "Filters" field is base64(JSON.stringify(...)) of a
// {[filterKey]: {id, choices: [{id}]}} map built from the URL's own query
// params, and pagination is driven by an opaque "EncodedCT" continuation
// token the server hands back with each page (it must be threaded through
// sequentially -- there's no numeric offset to jump to, unlike Steam's own
// search endpoint). Confirmed live: PlayWith=CloudGaming alone matches 3,682
// titles (vs. the marketing chart's fixed 50), paged 25 at a time with zero
// duplicates across 6 consecutive pages, and orderby supports "MostPopular
// desc" / "ReleaseDate desc" / "DiscountPercentage desc" -- all scoped to
// that same CloudGaming-filtered set.
//
// This only returns bare product ids: launching a title still needs the
// user's own entitled xCloud catalog (for the internal titleId a stream
// actually starts with, which no public Store API exposes), so the caller
// cross-references these ids against that catalog the same way the old
// chart-scrape result was matched.
import axios from 'axios';
import {storage} from '../../../store/mmkv';
import {debugFactory} from '../../../utils/debug';

const log = debugFactory('xboxBrowse');

const BROWSE_URL = 'https://emerald.xboxservices.com/xboxcomfd/browse';
const API_VERSION = '1.1';
const CHANNEL_KEY = 'browse';
export const XBOX_BROWSE_PAGE_SIZE = 25; // fixed server-side -- confirmed live, no size param changes it

export type XboxBrowseSort =
  | 'MostPopular desc'
  | 'ReleaseDate desc'
  | 'DiscountPercentage desc';

export type XboxBrowsePage = {
  productIds: string[];
  totalCount?: number;
  nextCT?: string;
};

const cacheKey = (sort: XboxBrowseSort, locale: string): string =>
  `store.xboxBrowse.${sort}.${locale}`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h, same as the old chart cache

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// btoa isn't guaranteed available on RN's JS engine -- encode by hand. Only
// ever fed plain-ASCII JSON (filter ids, sort names), so no multi-byte
// handling is needed.
export const base64Encode = (input: string): string => {
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i);
    const c2 = input.charCodeAt(i + 1);
    const c3 = input.charCodeAt(i + 2);
    const hasC2 = i + 1 < input.length;
    const hasC3 = i + 2 < input.length;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (hasC2 ? c2 >> 4 : 0);
    const e3 = hasC2 ? ((c2 & 15) << 2) | (hasC3 ? c3 >> 6 : 0) : 64;
    const e4 = hasC3 ? c3 & 63 : 64;
    output +=
      BASE64_CHARS[e1] +
      BASE64_CHARS[e2] +
      (e3 === 64 ? '=' : BASE64_CHARS[e3]) +
      (e4 === 64 ? '=' : BASE64_CHARS[e4]);
  }
  return output;
};

export const encodeFilters = (sort: XboxBrowseSort): string =>
  base64Encode(
    JSON.stringify({
      PlayWith: {id: 'PlayWith', choices: [{id: 'CloudGaming'}]},
      orderby: {id: 'orderby', choices: [{id: sort}]},
    }),
  );

// A syntactically plausible MS correlation vector. The server only checks
// that the header is present and roughly this shape, not its content
// (confirmed live with random values).
const makeCorrelationVector = (): string => {
  let base = '';
  for (let i = 0; i < 22; i++) {
    base += BASE64_CHARS[Math.floor(Math.random() * BASE64_CHARS.length)];
  }
  return `${base}.0`;
};

export const getFreshXboxBrowsePage = (
  sort: XboxBrowseSort,
  locale: string,
): XboxBrowsePage | null => {
  const raw = storage.getString(cacheKey(sort, locale));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.page?.productIds) &&
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < CACHE_TTL_MS
    ) {
      return parsed.page as XboxBrowsePage;
    }
  } catch {}
  return null;
};

// Fetch one page of Xbox's CloudGaming-filtered browse results. Pass the
// previous page's `nextCT` to continue; omit it to start over from the top.
// Only the first page (no `encodedCT`) is cached, for an instant paint --
// deeper pages are cheap enough (25 items) to always fetch live, and caching
// a mid-sequence continuation token would go stale as soon as the list
// itself changes. Returns {productIds: []} on any failure.
export const fetchXboxBrowsePage = async (
  sort: XboxBrowseSort,
  locale: string,
  encodedCT?: string,
): Promise<XboxBrowsePage> => {
  const body: Record<string, unknown> = {
    Filters: encodeFilters(sort),
    ReturnFilters: !encodedCT,
    ChannelKeyToBeUsedInResponse: CHANNEL_KEY,
  };
  if (encodedCT) {
    body.EncodedCT = encodedCT;
  }

  try {
    const res = await axios.post(BROWSE_URL, body, {
      params: {locale},
      headers: {
        'Content-Type': 'application/json',
        'X-MS-API-Version': API_VERSION,
        'MS-CV': makeCorrelationVector(),
      },
      timeout: 15000,
    });
    const channel = res?.data?.channels?.[CHANNEL_KEY];
    const productIds: string[] = Array.isArray(channel?.products)
      ? channel.products.map((p: any) => p?.productId).filter(Boolean)
      : [];
    const page: XboxBrowsePage = {
      productIds,
      totalCount: channel?.totalItems,
      nextCT: channel?.encodedCT,
    };
    if (!encodedCT && productIds.length > 0) {
      try {
        storage.set(
          cacheKey(sort, locale),
          JSON.stringify({ts: Date.now(), page}),
        );
      } catch {}
    }
    return page;
  } catch (e) {
    log.info('fetchXboxBrowsePage failed:', e);
    return {productIds: []};
  }
};
