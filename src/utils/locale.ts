import {NativeModules, Platform} from 'react-native';

export const SUPPORTED_LOCALES = [
  'en',
  'zh',
  'zht',
  'de',
  'es',
  'pt',
  'ko',
  'ja',
  'hi',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const normalizeAppLocale = (locale?: string | null): SupportedLocale => {
  const raw = String(locale || '')
    .replace('_', '-')
    .toLowerCase();

  if (raw === 'zht') {
    return 'zht';
  }

  if (raw.startsWith('zh')) {
    if (
      raw.includes('hant') ||
      raw.includes('tw') ||
      raw.includes('hk') ||
      raw.includes('mo')
    ) {
      return 'zht';
    }
    return 'zh';
  }

  if (raw.startsWith('de')) {
    return 'de';
  }
  if (raw.startsWith('es')) {
    return 'es';
  }
  if (raw.startsWith('pt')) {
    return 'pt';
  }
  if (raw.startsWith('ko')) {
    return 'ko';
  }
  if (raw.startsWith('ja')) {
    return 'ja';
  }
  if (raw.startsWith('hi')) {
    return 'hi';
  }

  return 'en';
};

const getRawSystemLocale = (): string => {
  const settings = NativeModules.SettingsManager?.settings;
  const iosLocale =
    settings?.AppleLocale ||
    (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : '');
  const androidLocale =
    NativeModules.I18nManager?.localeIdentifier ||
    NativeModules.PlatformConstants?.locale ||
    NativeModules.PlatformConstants?.reactNativeVersion?.locale;

  return String((Platform.OS === 'ios' ? iosLocale : androidLocale) || '');
};

export const getSystemLocale = (): SupportedLocale => {
  return normalizeAppLocale(getRawSystemLocale());
};

// Extract the BCP-47 region subtag (2 letters or 3 digits) from a locale tag,
// tolerant of a script subtag. e.g. "zh-Hant-TW" -> "TW", "en-US" -> "US",
// "ja" -> "". Returns an uppercased region or '' when there isn't one.
export const parseRegion = (tag?: string | null): string => {
  if (!tag) {
    return '';
  }
  const parts = String(tag).replace(/_/g, '-').split('-');
  // Region follows language (and optional script) in BCP-47 order; scan from
  // the end so a 4-letter script subtag (e.g. "Hant") is never mistaken for it.
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) {
      return part.toUpperCase();
    }
  }
  return '';
};

// The device's region/country code (e.g. "JP", "US"), or '' if unknown. Used
// as the best proxy for the user's Store market when pricing titles.
export const getSystemRegion = (): string => parseRegion(getRawSystemLocale());
