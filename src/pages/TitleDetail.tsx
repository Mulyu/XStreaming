import React from 'react';
import {
  Alert,
  StyleSheet,
  View,
  ScrollView,
  Image,
  NativeModules,
  Platform,
  Pressable,
  ToastAndroid,
  Linking,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  Button,
  Portal,
  Modal,
  Card,
  HelperText,
  IconButton,
} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {WebView} from 'react-native-webview';
import Spinner from '../components/Spinner';
import TitleAchievements from '../components/TitleAchievements';
import {useDispatch} from 'react-redux';
import {getSettings} from '../store/settingStore';
import {getXcloudData, saveXcloudData} from '../store/xcloudStore';
import {
  findTitleByProductId,
  getTitleProductId,
  getTitleStreamingId,
  saveTitleShortcutSnapshot,
} from '../store/shortcutStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {
  PriceInfo,
  RatingInfo,
  TitleDetails,
  fetchTitleDetails,
  deriveMarketLanguage,
  getStoreUrl,
  getPrice,
  formatPrice,
  discountPercent,
  formatSaleEnd,
} from '../utils/storePrice';
import {getSystemRegion, toBcp47Locale} from '../utils/locale';
import {fetchLeavingSoon} from '../utils/leavingSoon';
import {
  getFreshPriceCache,
  getFreshLeavingSoon,
  saveLeavingSoon,
} from '../store/priceStore';
import games from '../mock/games.json';

const {UsbRumbleManager, ShortcutManager} = NativeModules;

const log = debugFactory('TitleDetailScreen');

const warnTitles: any = [];

// Canonical capability id -> icon + label. Labels are either translated
// (t(...)) or kept as brand literals (4K, HDR, Dolby Atmos, ...).
const CAP_META: Record<string, {icon: string; label: string; i18n?: boolean}> =
  {
    single: {icon: 'person-outline', label: 'Single player', i18n: true},
    multi: {icon: 'people-outline', label: 'Multiplayer', i18n: true},
    coop: {icon: 'people-circle-outline', label: 'Co-op', i18n: true},
    crossplat: {
      icon: 'git-compare-outline',
      label: 'Cross-platform',
      i18n: true,
    },
    optimized: {
      icon: 'flash-outline',
      label: 'Optimized for Series X|S',
      i18n: true,
    },
    '4k': {icon: 'tv-outline', label: '4K'},
    hdr: {icon: 'contrast-outline', label: 'HDR'},
    dolbyvision: {icon: 'contrast-outline', label: 'Dolby Vision'},
    atmos: {icon: 'volume-high-outline', label: 'Dolby Atmos'},
    dtsx: {icon: 'volume-high-outline', label: 'DTS:X'},
    spatial: {icon: 'headset-outline', label: 'Spatial sound', i18n: true},
    achievements: {icon: 'trophy-outline', label: 'Achievements', i18n: true},
    cloudsaves: {icon: 'cloud-outline', label: 'Cloud saves', i18n: true},
  };

function TitleDetail({navigation, route}) {
  const {t, i18n} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();
  const [titleItem, setTitleItem] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [starTitles, setStarTitles] = React.useState<any>([]);
  const [ignoreTitles, setIgnoreTitles] = React.useState<any>([]);
  const [shortcutLoadFailed, setShortcutLoadFailed] = React.useState(false);
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);
  const [price, setPrice] = React.useState<PriceInfo | null>(null);
  const [rating, setRating] = React.useState<RatingInfo | null>(null);
  const [details, setDetails] = React.useState<TitleDetails | null>(null);
  const [isLeavingSoon, setIsLeavingSoon] = React.useState(false);
  const [descExpanded, setDescExpanded] = React.useState(false);
  // Fullscreen media viewer: a screenshot image or a trailer video.
  const [viewer, setViewer] = React.useState<{
    type: 'image' | 'trailer';
    uri: string;
  } | null>(null);
  // Read here so a game-language / device-region change re-runs the effect.
  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();
  const autoStartHandledRef = React.useRef(false);
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;
  const canAddTitleShortcut =
    Platform.OS === 'android' &&
    !Platform.isTV &&
    !!ShortcutManager?.addTitleShortcut;

  React.useEffect(() => {
    log.info('TitleDetail titleItem:', route.params?.titleItem);
    let nextTitleItem = route.params?.titleItem;
    if (!nextTitleItem && route.params?.productId) {
      nextTitleItem = findTitleByProductId(route.params.productId);
    }

    if (nextTitleItem) {
      setTitleItem(nextTitleItem);
      setShortcutLoadFailed(false);
    } else if (route.params?.productId) {
      setTitleItem(null);
      setShortcutLoadFailed(true);
    }
    const _settings = getSettings();
    setSettings(_settings);

    const cacheData = getXcloudData();

    if (cacheData) {
      setStarTitles(cacheData.starTitles || []);
      setIgnoreTitles(cacheData.ignoreTitles || []);
    }

    navigation.setOptions({
      title: nextTitleItem?.ProductTitle || '',
    });
  }, [route.params?.titleItem, route.params?.productId, navigation]);

  const handleStartGame = async () => {
    const titleId = titleItem.titleId || titleItem.XCloudTitleId;
    log.info('HandleStartCloudGame titleId:', titleId);
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    if (isUsbMode) {
      setShowUsbWarnShowModal(true);
    } else {
      handleNavigateStream();
    }
  };

  const handleNavigateStream = async () => {
    const titleId = titleItem.titleId || titleItem.XCloudTitleId;
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const usbController = await UsbRumbleManager.getUsbController();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    const routeName = settings.native_portrait_mode
      ? 'NativePortraitStream'
      : 'NativeStream';

    let postUrl = '';
    if (titleItem.Image_Poster && titleItem.Image_Poster.URL) {
      postUrl = `https:${titleItem.Image_Poster.URL}`;
    }

    navigation.navigate({
      name: routeName,
      params: {
        sessionId: titleId,
        settings,
        streamType: 'cloud',
        postUrl,
        isUsbMode,
        usbController,
      },
    });
  };

  // Fetch this title's full store detail (price + rating + rich fields) in one
  // DisplayCatalog call. Seed the price from the list's cache first so it shows
  // instantly, then let the fetch fill in the rest and refresh it.
  React.useEffect(() => {
    if (!titleItem) {
      setPrice(null);
      setRating(null);
      setDetails(null);
      return;
    }
    const productId = getTitleProductId(titleItem);
    setDescExpanded(false);
    if (!productId) {
      setPrice(null);
      setRating(null);
      setDetails(null);
      return;
    }
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    // Reuse the list's cached price/rating for an instant first paint.
    const priceCache = getFreshPriceCache(market);
    if (priceCache) {
      const cachedPrice = getPrice(priceCache.priceMap, productId);
      setPrice(cachedPrice || null);
      const cachedRating =
        priceCache.ratingMap?.[String(productId).toUpperCase()] || null;
      setRating(cachedRating);
    } else {
      setPrice(null);
      setRating(null);
    }
    // Details aren't cached by the list, so always clear then fetch.
    setDetails(null);

    let cancelled = false;
    fetchTitleDetails(productId, market, language, {
      isCancelled: () => cancelled,
    }).then(({price: p, rating: r, details: d, ok}) => {
      if (cancelled || !ok) {
        // On a hard fetch failure keep whatever the cache seeded above; only a
        // successful response is authoritative.
        return;
      }
      // Apply the fresh result verbatim, including nulls: a title that lost its
      // price/rating must not keep showing a stale cached one.
      setPrice(p);
      setRating(r);
      setDetails(d);
    });
    return () => {
      cancelled = true;
    };
  }, [titleItem, gameLanguage, deviceRegion]);

  // Whether this title is in the Game Pass "Leaving soon" collection, to show a
  // notice. Uses the list's cached set for an instant answer, else fetches it.
  React.useEffect(() => {
    setIsLeavingSoon(false);
    const productId = titleItem && getTitleProductId(titleItem);
    if (!productId) {
      return;
    }
    const key = String(productId).toUpperCase();
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    const cached = getFreshLeavingSoon(market);
    if (cached) {
      setIsLeavingSoon(cached.includes(key));
      return;
    }
    let cancelled = false;
    fetchLeavingSoon(market, language).then(ids => {
      if (!ids) {
        return;
      }
      // Persist so other title-detail visits (and the list) reuse this fetch
      // instead of re-downloading the whole collection per title.
      saveLeavingSoon(ids, market);
      if (!cancelled) {
        setIsLeavingSoon(ids.includes(key));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [titleItem, gameLanguage, deviceRegion]);

  const handleOpenStore = () => {
    const productId = titleItem && getTitleProductId(titleItem);
    if (productId) {
      Linking.openURL(getStoreUrl(productId)).catch(() => {});
    }
  };

  // Launched from a home-screen shortcut with autoStart: skip the detail
  // screen interaction and start streaming as soon as the title is ready.
  React.useEffect(() => {
    if (!route.params?.autoStart || autoStartHandledRef.current || !titleItem) {
      return;
    }
    autoStartHandledRef.current = true;
    navigation.setParams({autoStart: false});
    handleStartGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoStart, titleItem, settings]);

  // Warn: xboxOne controller must press Nexus button first to active button
  const renderUsbWarningModal = () => {
    if (!showUsbWarnModal) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={showUsbWarnModal}
          onDismiss={() => {
            setShowUsbWarnShowModal(false);
          }}
          contentContainerStyle={{marginLeft: '4%', marginRight: '4%'}}>
          <Card>
            <Card.Content>
              <Text>
                TIPS1:{' '}
                {t(
                  'It has been detected that you are using the wired connection mode with the Overwrite Android driver. If the USB connection is disconnected during the game, please exit the game and reconnect the controller; otherwise, the controller buttons will become unresponsive',
                )}
              </Text>
              <Text>
                TIPS2:{' '}
                {t(
                  'If you are using an Xbox One/S/X controller and encounter unresponsive buttons when entering the game, please press the home button on the controller first',
                )}
              </Text>

              <Button
                onPress={() => {
                  setShowUsbWarnShowModal(false);
                  handleNavigateStream();
                }}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderMediaViewer = () => {
    if (!viewer) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={!!viewer}
          onDismiss={() => setViewer(null)}
          contentContainerStyle={styles.viewerContainer}>
          <View style={styles.viewerInner}>
            {viewer.type === 'image' ? (
              <Image
                source={{uri: viewer.uri}}
                resizeMode="contain"
                style={styles.viewerImage}
              />
            ) : (
              <WebView
                source={{
                  // Inject the URL as a JS string (JSON.stringify escapes quotes
                  // and markup) rather than into an HTML attribute, so an
                  // unexpected character in the catalog URL can't break — or
                  // inject into — the page.
                  html: `<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh"><video id="v" controls autoplay playsinline style="width:100%;height:100%"></video><script>document.getElementById('v').src=${JSON.stringify(
                    viewer.uri,
                  )};</script></body>`,
                }}
                style={styles.viewerVideo}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
              />
            )}
            <IconButton
              icon="close"
              size={26}
              iconColor="#fff"
              style={styles.viewerClose}
              onPress={() => setViewer(null)}
            />
          </View>
        </Modal>
      </Portal>
    );
  };

  const handleToggleStar = () => {
    if (!titleItem) {
      return;
    }
    const cacheData = getXcloudData();
    const starId = titleItem.XCloudTitleId;
    const adding = !starTitles.includes(starId);

    const newStarTitles = adding
      ? [...starTitles.filter(id => id !== starId), starId]
      : starTitles.filter(id => id !== starId);
    // Favorite and ignore are mutually exclusive.
    const newIgnoreTitles = adding
      ? ignoreTitles.filter(
          id => id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
        )
      : ignoreTitles;

    setStarTitles(newStarTitles);
    setIgnoreTitles(newIgnoreTitles);
    dispatch({type: 'SET_STARS', payload: newStarTitles});
    dispatch({type: 'SET_IGNORES', payload: newIgnoreTitles});

    if (cacheData) {
      cacheData.starTitles = newStarTitles;
      cacheData.ignoreTitles = newIgnoreTitles;
      saveXcloudData(cacheData);
    }
  };

  const handleToggleIgnore = () => {
    if (!titleItem) {
      return;
    }
    const cacheData = getXcloudData();
    const ignoreId = titleItem.XCloudTitleId;
    const adding = !(
      ignoreTitles.includes(titleItem.XCloudTitleId) ||
      ignoreTitles.includes(titleItem.titleId)
    );

    const newIgnoreTitles = adding
      ? [
          ...ignoreTitles.filter(
            id => id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
          ),
          ignoreId,
        ]
      : ignoreTitles.filter(
          id => id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
        );
    // Ignore and favorite are mutually exclusive.
    const newStarTitles = adding
      ? starTitles.filter(
          id => id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
        )
      : starTitles;

    setIgnoreTitles(newIgnoreTitles);
    setStarTitles(newStarTitles);
    dispatch({type: 'SET_IGNORES', payload: newIgnoreTitles});
    dispatch({type: 'SET_STARS', payload: newStarTitles});

    if (cacheData) {
      cacheData.ignoreTitles = newIgnoreTitles;
      cacheData.starTitles = newStarTitles;
      saveXcloudData(cacheData);
    }
  };

  const handleAddToDesktop = async () => {
    if (!titleItem || !ShortcutManager?.addTitleShortcut) {
      Alert.alert(t('Warning'), t('TitleShortcutUnavailable'));
      return;
    }

    const productId = getTitleProductId(titleItem);
    if (!productId) {
      Alert.alert(t('Warning'), t('TitleShortcutMissingProduct'));
      return;
    }

    const titleName = titleItem.ProductTitle || productId;
    const artworkUrl =
      titleItem.Image_Poster?.URL || titleItem.Image_Tile?.URL || '';
    const iconUrl = artworkUrl ? `https:${artworkUrl}` : '';

    saveTitleShortcutSnapshot(titleItem);

    try {
      await ShortcutManager.addTitleShortcut({
        productId,
        titleId: getTitleStreamingId(titleItem),
        xCloudTitleId: titleItem.XCloudTitleId || '',
        titleName,
        iconUrl,
      });
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

  let isByorg = false;
  if (titleItem && titleItem.details && !titleItem.details.hasEntitlement) {
    isByorg = true;
  }

  let isStar = false;
  if (
    titleItem &&
    (starTitles.includes(titleItem.XCloudTitleId) ||
      starTitles.includes(titleItem.titleId))
  ) {
    isStar = true;
  }

  let isIgnored = false;
  if (
    titleItem &&
    (ignoreTitles.includes(titleItem.XCloudTitleId) ||
      ignoreTitles.includes(titleItem.titleId))
  ) {
    isIgnored = true;
  }

  const localGame = (titleItem && games[titleItem.XboxTitleId]) || undefined;

  // Prefer the store's full description; fall back to the bundled short one.
  const description =
    (details && details.description) || localGame?.short_description || '';

  // Hero art: store key art, else the bundled hero, else the poster.
  let heroUri = details?.heroImage || '';
  if (!heroUri && localGame?.image_urls?.hero) {
    heroUri = localGame.image_urls.hero;
  }
  if (!heroUri && titleItem?.Image_Poster?.URL) {
    heroUri = `https:${titleItem.Image_Poster.URL}`;
  }
  const boxUri = titleItem?.Image_Poster?.URL
    ? `https:${titleItem.Image_Poster.URL}`
    : localGame?.image_urls?.box_art || '';
  // When the hero fell back to the poster (no wide key art), don't also show the
  // same poster as the box-art thumbnail stacked on top of itself.
  const showBoxart = !!boxUri && boxUri !== heroUri;

  const priceDiscount = price ? discountPercent(price) : 0;
  const showDetailSale = !!price && price.onSale && priceDiscount > 0;
  const saleEndLabel =
    price && showDetailSale
      ? formatSaleEnd(price, toBcp47Locale(i18n.language))
      : '';
  const canOpenStore = !!(titleItem && getTitleProductId(titleItem));

  const releaseDateLabel = React.useMemo(() => {
    if (!details?.releaseDate) {
      return '';
    }
    const d = new Date(details.releaseDate);
    if (!Number.isFinite(d.getTime())) {
      return '';
    }
    try {
      return new Intl.DateTimeFormat(
        toBcp47Locale(i18n.language) || undefined,
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        },
      ).format(d);
    } catch (e) {
      return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    }
  }, [details?.releaseDate, i18n.language]);

  const capLabel = (id: string) => {
    const meta = CAP_META[id];
    if (!meta) {
      return id;
    }
    return meta.i18n ? t(meta.label) : meta.label;
  };

  const renderStars = (avg: number) => {
    const items = [];
    for (let i = 1; i <= 5; i++) {
      let name = 'star-outline';
      if (avg >= i) {
        name = 'star';
      } else if (avg >= i - 0.5) {
        name = 'star-half';
      }
      items.push(<Ionicons key={i} name={name} size={16} color="#ffc233" />);
    }
    return items;
  };

  const renderLargeActionButton = (
    label: string,
    onPress: () => void,
    primary = false,
  ) => {
    return (
      <Pressable
        focusable={true}
        hasTVPreferredFocus={primary}
        onPress={onPress}
        android_ripple={{
          color: primary
            ? 'rgba(255, 255, 255, 0.18)'
            : 'rgba(16, 124, 16, 0.16)',
        }}
        style={({focused, pressed}: any) => [
          styles.tvActionButton,
          primary ? styles.tvActionButtonPrimary : styles.tvActionButtonPlain,
          focused && styles.tvActionButtonFocused,
          pressed && styles.tvActionButtonPressed,
        ]}>
        <Text
          style={[
            styles.tvActionButtonText,
            primary
              ? styles.tvActionButtonTextPrimary
              : styles.tvActionButtonTextPlain,
          ]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderActionBar = () => {
    return (
      <View
        style={[styles.buttonWrap, isLargeScreen && styles.buttonWrapLarge]}>
        {isLargeScreen ? (
          <>
            {renderLargeActionButton(t('Start game'), handleStartGame, true)}
            {renderLargeActionButton(t('Back'), () => navigation.goBack())}
          </>
        ) : (
          <>
            <Button
              mode="elevated"
              style={styles.button}
              onPress={handleStartGame}>
              &nbsp;{t('Start game')} &nbsp;
            </Button>
            <Button
              mode="text"
              style={styles.button}
              onPress={() => navigation.goBack()}>
              {t('Back')}
            </Button>
          </>
        )}
      </View>
    );
  };

  const hasTrailer = !!details?.trailers?.length;
  const trailer = hasTrailer ? details!.trailers[0] : null;
  const screenshots = details?.screenshots || [];
  const hasMedia = hasTrailer || screenshots.length > 0;

  return (
    <View style={styles.container}>
      <Spinner
        loading={!titleItem && !shortcutLoadFailed}
        text={t('Loading...')}
      />

      {renderUsbWarningModal()}
      {renderMediaViewer()}

      {shortcutLoadFailed && (
        <View style={styles.errorWrap}>
          <HelperText type="error" visible={true}>
            {t('TitleShortcutExpired')}
          </HelperText>
          <Button mode="text" onPress={() => navigation.goBack()}>
            {t('Back')}
          </Button>
        </View>
      )}

      {titleItem && (
        <>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.contentInner,
                isLargeScreen && styles.contentLarge,
              ]}>
              {/* HERO */}
              <View style={styles.hero}>
                {heroUri ? (
                  <Image
                    source={{uri: heroUri}}
                    resizeMode="cover"
                    style={styles.heroImage}
                  />
                ) : null}
                <View style={styles.heroScrim} />
                {details?.ratingLevel ? (
                  <View style={styles.ageBadge}>
                    <Text style={styles.ageLevel}>{details.ratingLevel}</Text>
                    {details.ratingSystem ? (
                      <Text style={styles.ageSystem}>
                        {details.ratingSystem}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.heroFoot}>
                  {showBoxart ? (
                    <Image
                      source={{uri: boxUri}}
                      resizeMode="cover"
                      style={styles.boxart}
                    />
                  ) : null}
                  <View style={styles.heroText}>
                    <Text style={styles.heroTitle}>
                      {titleItem.ProductTitle}
                    </Text>
                    <Text style={styles.heroPublisher}>
                      {details?.publisher || titleItem.PublisherName}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.body}>
                {/* leaving soon notice */}
                {isLeavingSoon && (
                  <View style={styles.leavingBanner}>
                    <Ionicons name="time" size={20} color="#1a1205" />
                    <View style={styles.leavingBannerText}>
                      <Text style={styles.leavingBannerTitle}>
                        {t('Leaving soon')}
                      </Text>
                      <Text style={styles.leavingBannerSub}>
                        {t('Leaving Game Pass soon')}
                      </Text>
                    </View>
                  </View>
                )}

                {/* quick actions */}
                <View style={styles.quickRow}>
                  {canOpenStore && (
                    <IconButton
                      icon="open-in-new"
                      size={22}
                      accessibilityLabel={t('View in store')}
                      style={styles.quickBtn}
                      onPress={handleOpenStore}
                    />
                  )}
                  {canAddTitleShortcut && (
                    <IconButton
                      icon="plus-box-outline"
                      size={22}
                      accessibilityLabel={t('Add to desktop')}
                      style={styles.quickBtn}
                      onPress={handleAddToDesktop}
                    />
                  )}
                  <IconButton
                    icon={isStar ? 'cards-heart' : 'cards-heart-outline'}
                    size={22}
                    iconColor={isStar ? '#ff5347' : undefined}
                    accessibilityLabel={t('Stars')}
                    style={styles.quickBtn}
                    onPress={handleToggleStar}
                  />
                  <IconButton
                    icon={isIgnored ? 'eye' : 'eye-off-outline'}
                    size={22}
                    iconColor={isIgnored ? '#E5533C' : undefined}
                    accessibilityLabel={isIgnored ? t('Unignore') : t('Ignore')}
                    style={styles.quickBtn}
                    onPress={handleToggleIgnore}
                  />
                </View>

                {/* price */}
                {price && (
                  <View style={styles.priceBlock}>
                    <Text
                      style={[
                        styles.priceNow,
                        showDetailSale && styles.priceNowSale,
                      ]}>
                      {formatPrice(price.listPrice, price.currencyCode)}
                    </Text>
                    {showDetailSale && (
                      <Text style={styles.priceWas}>
                        {formatPrice(price.msrp, price.currencyCode)}
                      </Text>
                    )}
                    {showDetailSale && (
                      <Text style={styles.priceOff}>-{priceDiscount}%</Text>
                    )}
                    {saleEndLabel ? (
                      <Text style={styles.saleEnds}>
                        {t('Sale ends')} {saleEndLabel}
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* rating */}
                {rating && (
                  <View style={styles.ratingRow}>
                    <View style={styles.starsRow}>
                      {renderStars(rating.average)}
                    </View>
                    <Text style={styles.ratingNum}>
                      {rating.average.toFixed(1)}
                    </Text>
                    <Text style={styles.ratingCount}>
                      ({rating.count.toLocaleString()})
                    </Text>
                  </View>
                )}

                {/* meta */}
                {(releaseDateLabel ||
                  details?.developer ||
                  details?.publisher) && (
                  <View style={styles.metaRow}>
                    {releaseDateLabel ? (
                      <View style={styles.metaCol}>
                        <Text style={styles.metaKey}>{t('Release date')}</Text>
                        <Text style={styles.metaVal}>{releaseDateLabel}</Text>
                      </View>
                    ) : null}
                    {details?.developer ? (
                      <View style={styles.metaCol}>
                        <Text style={styles.metaKey}>{t('Developer')}</Text>
                        <Text style={styles.metaVal}>{details.developer}</Text>
                      </View>
                    ) : null}
                    {details?.publisher ? (
                      <View style={styles.metaCol}>
                        <Text style={styles.metaKey}>{t('Publisher')}</Text>
                        <Text style={styles.metaVal}>{details.publisher}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* capabilities */}
                {details?.capabilities?.length ? (
                  <View>
                    <Text style={styles.secTitle}>{t('Features')}</Text>
                    <View style={styles.chips}>
                      {details.capabilities.map(id => (
                        <View style={styles.chip} key={id}>
                          <Ionicons
                            name={CAP_META[id]?.icon || 'ellipse-outline'}
                            size={14}
                            color="#3ad46b"
                          />
                          <Text style={styles.chipText}>{capLabel(id)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* media: trailer + screenshots */}
                {hasMedia && (
                  <View>
                    <Text style={styles.secTitle}>{t('Media')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.mediaRail}>
                      {trailer && (
                        <Pressable
                          focusable={true}
                          onPress={() =>
                            setViewer({type: 'trailer', uri: trailer.url})
                          }
                          style={styles.trailer}>
                          {trailer.preview ? (
                            <Image
                              source={{uri: trailer.preview}}
                              resizeMode="cover"
                              style={styles.mediaShot}
                            />
                          ) : (
                            <View
                              style={[styles.mediaShot, styles.trailerFallback]}
                            />
                          )}
                          <View style={styles.playBtn}>
                            <Ionicons name="play" size={20} color="#fff" />
                          </View>
                          <Text style={styles.trailerLabel}>
                            {t('Trailer')}
                          </Text>
                        </Pressable>
                      )}
                      {screenshots.map((uri, idx) => (
                        <Pressable
                          key={uri || idx}
                          focusable={true}
                          onPress={() => setViewer({type: 'image', uri})}>
                          <Image
                            source={{uri}}
                            resizeMode="cover"
                            style={styles.mediaShot}
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* achievements (signed-in only; hides itself otherwise) */}
                <TitleAchievements
                  titleId={titleItem.XboxTitleId}
                  titleName={titleItem.ProductTitle}
                  navigation={navigation}
                />

                {/* description */}
                {description ? (
                  <View>
                    <Text style={styles.secTitle}>{t('Description')}</Text>
                    <Text
                      style={styles.description}
                      numberOfLines={descExpanded ? undefined : 6}>
                      {description}
                    </Text>
                    {description.length > 140 && (
                      <Pressable
                        focusable={true}
                        onPress={() => setDescExpanded(v => !v)}>
                        <Text style={styles.moreLink}>
                          {descExpanded ? t('Show less') : t('Show more')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}

                {/* warnings */}
                {isByorg && (
                  <HelperText type="error" visible={true}>
                    {t('byorg')}
                  </HelperText>
                )}
                {warnTitles.indexOf(titleItem.titleId) > -1 ? (
                  <HelperText type="error" visible={true}>
                    {t('compatibleWarn')}
                  </HelperText>
                ) : null}

                {/* categories */}
                {titleItem.LocalizedCategories && (
                  <View style={styles.chips}>
                    {titleItem.LocalizedCategories.map(item => (
                      <View style={styles.catChip} key={item}>
                        <Text style={styles.catChipText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
          {renderActionBar()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  contentInner: {
    width: '100%',
  },
  contentLarge: {
    maxWidth: 900,
    alignSelf: 'center',
  },
  hero: {
    position: 'relative',
    width: '100%',
    height: 300,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,18,18,0.28)',
  },
  ageBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  ageLevel: {fontSize: 17, fontWeight: '800', lineHeight: 19},
  ageSystem: {fontSize: 9, color: '#c9cdc9', marginTop: 2, letterSpacing: 0.5},
  heroFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  boxart: {
    width: 76,
    height: 76,
    borderRadius: 12,
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
  },
  heroText: {flex: 1, minWidth: 0},
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 12,
  },
  heroPublisher: {
    fontSize: 13,
    color: '#e2e6e2',
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 8,
  },
  body: {
    padding: 16,
    gap: 18,
  },
  leavingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 157, 30, 0.14)',
    borderColor: 'rgba(255, 157, 30, 0.55)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  leavingBannerText: {flex: 1, minWidth: 0},
  leavingBannerTitle: {fontSize: 14, fontWeight: '800', color: '#ff9d1e'},
  leavingBannerSub: {fontSize: 12.5, color: '#cdd3ce', marginTop: 2},
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -4,
    marginBottom: -6,
  },
  quickBtn: {margin: 0},
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  priceNow: {
    fontSize: 22,
    fontWeight: '900',
    marginRight: 10,
  },
  priceNowSale: {color: '#ff5347'},
  priceWas: {
    fontSize: 14,
    color: '#9096a8',
    textDecorationLine: 'line-through',
    marginRight: 10,
  },
  priceOff: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    backgroundColor: '#ff5347',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  saleEnds: {
    width: '100%',
    fontSize: 12,
    color: '#ff5347',
    fontWeight: '600',
    marginTop: 4,
  },
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  starsRow: {flexDirection: 'row'},
  ratingNum: {fontSize: 15, fontWeight: '700'},
  ratingCount: {fontSize: 13, color: '#9aa2a0'},
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  metaCol: {gap: 2},
  metaKey: {
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6d7472',
  },
  metaVal: {fontSize: 13.5, fontWeight: '600'},
  secTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#9aa2a0',
    marginBottom: 10,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {fontSize: 12.5, fontWeight: '500', color: '#dfe4e0'},
  catChip: {
    borderColor: 'rgba(58,212,107,0.32)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipText: {fontSize: 12.5, color: '#3ad46b', fontWeight: '500'},
  mediaRail: {gap: 10, paddingRight: 4},
  mediaShot: {
    width: 234,
    height: 132,
    borderRadius: 10,
    borderColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
  },
  trailer: {position: 'relative'},
  trailerFallback: {backgroundColor: 'rgba(255,255,255,0.06)'},
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -23,
    marginLeft: -23,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(16,124,16,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailerLabel: {
    position: 'absolute',
    left: 9,
    bottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  description: {
    color: '#cdd3ce',
    fontSize: 14,
    lineHeight: 22,
  },
  moreLink: {
    color: '#3ad46b',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
  },
  viewerContainer: {
    flex: 1,
    margin: 0,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  viewerInner: {flex: 1, justifyContent: 'center'},
  viewerImage: {width: '100%', height: '100%'},
  viewerVideo: {flex: 1, backgroundColor: '#000'},
  viewerClose: {position: 'absolute', top: 10, right: 6},
  buttonWrap: {
    width: '100%',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 124, 16, 0.18)',
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
  },
  buttonWrapLarge: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  button: {
    marginTop: 10,
  },
  tvActionButton: {
    minWidth: 150,
    height: 42,
    borderRadius: 8,
    marginRight: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tvActionButtonPrimary: {
    backgroundColor: '#107C10',
    borderColor: '#107C10',
  },
  tvActionButtonPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(16, 124, 16, 0.42)',
  },
  tvActionButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  tvActionButtonPressed: {
    opacity: 0.78,
  },
  tvActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tvActionButtonTextPrimary: {
    color: '#FFFFFF',
  },
  tvActionButtonTextPlain: {
    color: '#107C10',
  },
});

export default TitleDetail;
