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

  return String(Platform.OS === 'ios' ? iosLocale : androidLocale || '');
};

export const getSystemLocale = (): SupportedLocale => {
  return normalizeAppLocale(getRawSystemLocale());
};

// The device's region/country code (e.g. "JP", "US"), or '' if unknown. Used
// as the best proxy for the user's Store market when pricing titles.
export const getSystemRegion = (): string => {
  const raw = getRawSystemLocale().replace('_', '-');
  const region = raw.split('-')[1];
  return region ? region.toUpperCase() : '';
};
