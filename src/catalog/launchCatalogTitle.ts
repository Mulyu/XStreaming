import {
  CatalogPreference,
  setCatalogPreference,
} from '../store/catalogPreferences';
import {CatalogTitle} from './unifiedCatalog';
import {getTitleStreamingId} from '../store/shortcutStore';
import {getSettings} from '../store/settingStore';

// Launches a merged catalog title via a specific provider (and, for GFN, a
// specific store), remembering the choice so the next tap on this title from
// the Library grid can skip straight past the "which one?" step. Both
// providers go straight to the stream screen -- xCloud used to detour
// through TitleDetail.tsx first (an xCloud-only detail screen the user had
// to tap "Start game" on again), which GFN never did.
export const launchWithProvider = (
  navigation: any,
  catalogTitle: CatalogTitle,
  preference: CatalogPreference,
): void => {
  setCatalogPreference(catalogTitle.key, preference);

  if (preference.provider === 'xcloud') {
    const raw = catalogTitle.xcloud?.raw;
    const sessionId = getTitleStreamingId(raw);
    if (!raw || !sessionId) {
      return;
    }
    const postUrl = raw.Image_Poster?.URL
      ? `https:${raw.Image_Poster.URL}`
      : '';
    navigation.navigate({
      name: getSettings().native_portrait_mode
        ? 'NativePortraitStream'
        : 'NativeStream',
      params: {
        sessionId,
        streamType: 'cloud',
        postUrl,
        title: raw.ProductTitle || catalogTitle.title,
      },
    });
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
