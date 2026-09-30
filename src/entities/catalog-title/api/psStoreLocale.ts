import {getSettings} from '../../../shared/lib/settings';

// store.playstation.com's own GraphQL API and its store-front URLs both use
// the same lowercase-hyphenated region tag -- confirmed live only for
// en-US/ja-JP so far (the `x-psn-store-locale-override` header accepts
// "ja-JP"/"en-US" mixed-case, and the store.playstation.com/<locale>/...
// URL path accepts the lowercase form of the same tag); the rest below
// follow Sony's documented region-tag convention but aren't individually
// live-verified, same caveat as an unconfirmed entry in gfnLocale.ts would
// carry.
const PS_STORE_LOCALES: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zh: 'zh-Hans-CN',
  zht: 'zh-Hant-TW',
};

const DEFAULT_PS_STORE_LOCALE = 'en-US';

// e.g. "ja-JP" -- for the `x-psn-store-locale-override` header.
export const getPsStoreLocale = (): string =>
  PS_STORE_LOCALES[getSettings().locale] ?? DEFAULT_PS_STORE_LOCALE;

// e.g. "ja-jp" -- for the store.playstation.com/<slug>/... URL path.
export const getPsStoreUrlSlug = (): string => getPsStoreLocale().toLowerCase();
