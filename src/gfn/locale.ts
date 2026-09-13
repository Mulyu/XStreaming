import {getSettings} from '../store/settingStore';

// GFN's public per-locale catalog JSON (static.nvidiagrid.net) and its
// authenticated GraphQL API (games.geforce.com/graphql) use two different
// spellings of "the same" locale -- gfnpc-ja-JP.json vs the GraphQL
// `language`/`locale` variable's ja_JP -- both derived here from one table
// so the whole GFN catalog (public list, owned library, popularity/newest
// ranks, per-title details) follows XStreaming's own language setting
// instead of always showing NVIDIA's English-region catalog and rankings.
//
// Confirmed live: gfnpc-{slug}.json exists for de-DE, en-US, es-ES, es-MX,
// fr-FR, ja-JP, ko-KR, pt-BR, pt-PT, zh-CN and zh-TW; hi-IN 403s, so Hindi
// falls back to English rather than a broken fetch.
const GFN_LOCALE_SLUGS: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zh: 'zh-CN',
  zht: 'zh-TW',
};

const DEFAULT_GFN_LOCALE_SLUG = 'en-US';

// e.g. "ja-JP" -- the slug GFN's public catalog JSON is filed under.
export const getGfnLocaleSlug = (): string =>
  GFN_LOCALE_SLUGS[getSettings().locale] ?? DEFAULT_GFN_LOCALE_SLUG;

// e.g. "ja_JP" -- the same locale in the underscore form GFN's GraphQL API
// expects for its `language`/`locale` variables.
export const getGfnGraphqlLocale = (): string =>
  getGfnLocaleSlug().replace('-', '_');
