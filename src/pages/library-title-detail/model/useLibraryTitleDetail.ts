import React from 'react';
import {
  Linking,
  NativeModules,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import {useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation, useRoute} from '@react-navigation/native';
import {isSignedIn, getValidGfnJwt} from '../../../entities/gfn-account';
import {useGfnSignIn} from '../../../features/gfn-auth';
import {
  fetchGfnAppDetails,
  GfnAppDetails,
  CatalogTitle,
  getCatalogPreference,
  getFreshPriceCache,
  isCatalogTitleFavorite,
  setCatalogTitleFavorite,
  PriceInfo,
  RatingInfo,
  TitleDetails,
  fetchTitleDetails,
  deriveMarketLanguage,
  getPrice,
  fetchSteamPrices,
  SteamPriceInfo,
} from '../../../entities/catalog-title';
import {
  launchWithProvider,
  getTitleProductId,
  requestTitleShortcut,
} from '../../../features/launch-title';
import {getSettings} from '../../../shared/lib/settings';
import {getSystemRegion} from '../../../shared/lib/locale';

const {ShortcutManager} = NativeModules;

// A title's detail screen: rich info first (xCloud's own rich fields, with
// GFN's filling gaps), then "Play on" -- every provider it's actually
// available through, expanding into store choices for GFN when there's more
// than one. Each row dims when it isn't actually playable today (no Game
// Pass entitlement / not an owned GFN store variant). Picking any option
// remembers the choice for the Library grid's next tap on this title.
export function useLibraryTitleDetail() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const catalogTitle: CatalogTitle = route.params?.catalogTitle;

  const [gfnExpanded, setGfnExpanded] = React.useState(
    () => (catalogTitle?.gfn?.variants.length ?? 0) <= 1,
  );
  const {
    loginVisible,
    challenge,
    loginStatus,
    startLogin,
    retryLogin,
    cancelLogin,
  } = useGfnSignIn();

  const [price, setPrice] = React.useState<PriceInfo | null>(null);
  const [rating, setRating] = React.useState<RatingInfo | null>(null);
  const [details, setDetails] = React.useState<TitleDetails | null>(null);
  const [gfnDetails, setGfnDetails] = React.useState<GfnAppDetails | null>(
    null,
  );
  const [steamPrices, setSteamPrices] = React.useState<
    Record<string, SteamPriceInfo>
  >({});

  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();

  const preference = React.useMemo(
    () => (catalogTitle ? getCatalogPreference(catalogTitle.key) : null),
    [catalogTitle],
  );

  // Favorites are keyed by the catalog's own normalized-title key, not tied
  // to one provider -- a GFN-only title can be favorited exactly like an
  // xCloud one. See entities/catalog-title/model/favorites.ts.
  const [isFavorite, setIsFavorite] = React.useState(
    () => !!catalogTitle && isCatalogTitleFavorite(catalogTitle.key),
  );
  React.useEffect(() => {
    setIsFavorite(!!catalogTitle && isCatalogTitleFavorite(catalogTitle.key));
  }, [catalogTitle]);
  const toggleFavorite = () => {
    if (!catalogTitle) {
      return;
    }
    setCatalogTitleFavorite(catalogTitle.key, !isFavorite);
    setIsFavorite(!isFavorite);
  };

  // xCloud's own rich detail: rating, capabilities, trailer/screenshots,
  // full description -- reuses the exact fetch TitleDetail.tsx already uses,
  // seeded from the Library grid's cached price/rating for an instant paint.
  React.useEffect(() => {
    const productId = getTitleProductId(catalogTitle?.xcloud?.raw);
    setDetails(null);
    if (!productId) {
      setPrice(null);
      setRating(null);
      return;
    }
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    const cache = getFreshPriceCache(market);
    if (cache) {
      setPrice(getPrice(cache.priceMap, productId));
      setRating(cache.ratingMap?.[String(productId).toUpperCase()] || null);
    }
    let cancelled = false;
    fetchTitleDetails(productId, market, language, {
      isCancelled: () => cancelled,
    }).then(({price: p, rating: r, details: d, ok}) => {
      if (cancelled || !ok) {
        return;
      }
      setPrice(p);
      setRating(r);
      setDetails(d);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogTitle?.xcloud?.raw, gameLanguage, deviceRegion]);

  // GFN's own rich detail (description/screenshots), used only as a
  // fallback/supplement to xCloud's richer data -- e.g. a GFN-only title, or
  // to pad out a thin media strip. Needs a captured app-level uuid (only
  // known for a title an authenticated apps() call already resolved -- an
  // owned title, mainly) and a signed-in token; simply stays empty otherwise
  // rather than prompting a sign-in just to fetch extra description text.
  React.useEffect(() => {
    setGfnDetails(null);
    const appId = catalogTitle?.gfn?.variants.find(v => v.appId)?.appId;
    if (!appId || !isSignedIn()) {
      return;
    }
    let cancelled = false;
    getValidGfnJwt().then(token => {
      if (!token || cancelled) {
        return;
      }
      fetchGfnAppDetails(token, appId).then(d => {
        if (!cancelled && d) {
          setGfnDetails(d);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [catalogTitle?.gfn]);

  // Steam sale prices for every Steam-linked GFN store variant on this
  // title, confirmed live against Steam's own public appdetails endpoint --
  // no key, no sign-in needed.
  React.useEffect(() => {
    const steamAppIds = (catalogTitle?.gfn?.variants ?? [])
      .map(v => v.steamAppId)
      .filter((id): id is string => !!id);
    if (steamAppIds.length === 0) {
      setSteamPrices({});
      return;
    }
    let cancelled = false;
    fetchSteamPrices(steamAppIds, deviceRegion || 'US').then(result => {
      if (!cancelled) {
        setSteamPrices(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogTitle?.gfn, deviceRegion]);

  const playXcloud = () => {
    launchWithProvider(navigation, catalogTitle, {provider: 'xcloud'});
  };

  const playPsPlus = () => {
    launchWithProvider(navigation, catalogTitle, {provider: 'psplus'});
  };

  const playGfnVariant = (variant: {id: string; store: string}) => {
    const launch = () =>
      launchWithProvider(navigation, catalogTitle, {
        provider: 'gfn',
        store: variant.store,
        gfnId: variant.id,
      });
    if (!isSignedIn()) {
      startLogin(launch);
      return;
    }
    launch();
  };

  const canAddShortcut =
    Platform.OS === 'android' &&
    !Platform.isTV &&
    !!ShortcutManager?.addTitleShortcut;

  const addShortcut = async (
    snapshot: Parameters<typeof requestTitleShortcut>[1],
  ) => {
    try {
      await requestTitleShortcut(ShortcutManager, snapshot);
      ToastAndroid.show(t('TitleShortcutRequested'), ToastAndroid.SHORT);
    } catch (e: any) {
      const message =
        e?.code === 'SHORTCUT_UNSUPPORTED' ||
        e?.code === 'UNSUPPORTED_ANDROID_VERSION'
          ? t('TitleShortcutUnavailable')
          : `${t('TitleShortcutFailed')}: ${e?.message || e}`;
      Alert.alert(t('Warning'), message);
    }
  };

  const addXcloudShortcut = () => {
    if (!catalogTitle.xcloud?.raw) {
      return;
    }
    addShortcut({provider: 'xcloud', titleItem: catalogTitle.xcloud.raw});
  };

  const addGfnShortcut = (variant: {
    id: string;
    store: string;
    imageUrl?: string;
  }) => {
    addShortcut({
      provider: 'gfn',
      appId: variant.id,
      store: variant.store,
      title: catalogTitle.title,
      imageUrl: variant.imageUrl || catalogTitle.imageUrl,
    });
  };

  const openStore = (url: string) =>
    Linking.openURL(url).catch(() => {
      Alert.alert(t('Warning'), t('StoreLinkOpenFailed'));
    });

  const onToggleGfnExpanded = () => setGfnExpanded(v => !v);

  return {
    t,
    backgroundColor: theme.colors.background,
    catalogTitle,
    gfnExpanded,
    onToggleGfnExpanded,
    loginVisible,
    challenge,
    loginStatus,
    retryLogin,
    cancelLogin,
    price,
    rating,
    details,
    gfnDetails,
    steamPrices,
    preference,
    isFavorite,
    toggleFavorite,
    playXcloud,
    playPsPlus,
    playGfnVariant,
    canAddShortcut,
    addXcloudShortcut,
    addGfnShortcut,
    openStore,
  };
}

export type LibraryTitleDetailViewModel = ReturnType<
  typeof useLibraryTitleDetail
>;
