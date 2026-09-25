import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './shared/config/languages/en';
import zh from './shared/config/languages/zh';
import zht from './shared/config/languages/zht';
import de from './shared/config/languages/de';
import es from './shared/config/languages/es';
import pt from './shared/config/languages/pt';
import ko from './shared/config/languages/ko';
import ja from './shared/config/languages/ja';
import hi from './shared/config/languages/hi';
import {getSettings} from './shared/lib/settings';
import {normalizeAppLocale} from './shared/lib/locale';

const settings = getSettings();

const resources = {
  en,
  zh,
  zht,
  de,
  es,
  pt,
  ko,
  ja,
  hi,
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: normalizeAppLocale(settings.locale),
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
