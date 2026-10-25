// Where each provider lets the user see or change their plan. Opened in the
// browser -- none of the three has an in-app flow for it.

export type PlanProvider = 'xbox' | 'gfn' | 'psplus';

// The app's own locale codes to a region tag the providers' sites understand.
const REGION_TAG: Record<string, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  zht: 'zh-TW',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  ko: 'ko-KR',
  hi: 'hi-IN',
};

export const regionTag = (appLocale?: string): string =>
  REGION_TAG[appLocale || 'en'] || 'en-US';

export const planUrl = (provider: PlanProvider, appLocale?: string): string => {
  const tag = regionTag(appLocale);
  switch (provider) {
    case 'xbox':
      // Microsoft account > Services & subscriptions (Game Pass is managed
      // there).
      return `https://account.microsoft.com/services?lang=${tag}`;
    case 'gfn':
      // NVIDIA's membership page; the older /memberships/ path is gone (404).
      return `https://www.nvidia.com/${tag.toLowerCase()}/geforce-now/premium-memberships/`;
    default:
      // PlayStation account management > Subscription (no region in the path).
      return 'https://www.playstation.com/acct/management';
  }
};
