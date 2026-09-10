import {
  CatalogPreference,
  setCatalogPreference,
} from '../store/catalogPreferences';
import {CatalogTitle} from './unifiedCatalog';

// Launches a merged catalog title via a specific provider (and, for GFN, a
// specific store), remembering the choice so the next tap on this title from
// the Library grid can skip straight past the "which one?" step.
export const launchWithProvider = (
  navigation: any,
  catalogTitle: CatalogTitle,
  preference: CatalogPreference,
): void => {
  setCatalogPreference(catalogTitle.key, preference);

  if (preference.provider === 'xcloud') {
    const raw = catalogTitle.xcloud?.raw;
    if (!raw) {
      return;
    }
    navigation.navigate('TitleDetail', {titleItem: raw});
    return;
  }

  navigation.navigate('NativeStream', {
    streamType: 'gfn',
    appId: preference.gfnId,
    title: catalogTitle.title,
  });
};

// Whether a previously remembered preference still resolves to something
// this title actually offers today (a store link can disappear, an
// entitlement can lapse).
export const isPreferenceAvailable = (
  catalogTitle: CatalogTitle,
  preference: CatalogPreference,
): boolean => {
  if (preference.provider === 'xcloud') {
    return !!catalogTitle.xcloud;
  }
  return !!catalogTitle.gfn?.variants.some(
    variant =>
      variant.store === preference.store && variant.id === preference.gfnId,
  );
};
