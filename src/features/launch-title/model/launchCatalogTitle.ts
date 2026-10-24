import {
  CatalogPreference,
  setCatalogPreference,
  recordTitlePlayed,
  CatalogTitle,
} from '../../../entities/catalog-title';
import {getTitleStreamingId} from './shortcut';
import {recordRecentLaunch} from './recentLaunches';
import {getSettings} from '../../../shared/lib/settings';

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
    recordTitlePlayed(catalogTitle.key);
    recordRecentLaunch({provider: 'xcloud', titleItem: raw});
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

  if (preference.provider === 'psplus') {
    const game = catalogTitle.psplus?.raw;
    if (!game) {
      return;
    }
    // PS Plus renders through its own native SurfaceView (see
    // features/ps-plus-session), not NativeStream's WebRTC/xCloud-shaped
    // stream screen, so it gets its own route -- same params
    // ps-plus-library's own onSelectGame already builds for this screen.
    recordTitlePlayed(catalogTitle.key);
    recordRecentLaunch({provider: 'psplus', game});
    navigation.navigate('PsPlusStream', {
      productId: game.productId,
      name: game.name,
      serviceType: game.streamServiceType === 'psnow' ? 'psnow' : 'pscloud',
      streamIdentifier: game.streamIdentifier,
      platform: game.platform,
      isOwned: game.isOwned,
      entitlementId: game.entitlementId,
      posterUrl: catalogTitle.imageUrl ?? '',
    });
    return;
  }

  recordTitlePlayed(catalogTitle.key);
  recordRecentLaunch({
    provider: 'gfn',
    appId: preference.gfnId,
    store: preference.store,
    title: catalogTitle.title,
    imageUrl: catalogTitle.imageUrl ?? '',
  });
  navigation.navigate('NativeStream', {
    streamType: 'gfn',
    appId: preference.gfnId,
    title: catalogTitle.title,
    // Unlike xCloud's own raw.Image_Poster above, GFN's launch params never
    // carried an image at all -- the merged catalog entry already has one
    // (Steam-backed titles get it from gfnPublicGames.ts; other stores have
    // none, same as xCloud/PS Plus titles with no art fall back to
    // StreamHandshakeOverlay's plain glow backdrop).
    postUrl: catalogTitle.imageUrl ?? '',
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
  if (preference.provider === 'psplus') {
    return !!catalogTitle.psplus;
  }
  return !!catalogTitle.gfn?.variants.some(
    variant =>
      variant.store === preference.store && variant.id === preference.gfnId,
  );
};
