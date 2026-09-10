import React from 'react';
import {StyleSheet, View, Image, Pressable, ScrollView} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useTranslation} from 'react-i18next';
import {useNavigation, useRoute} from '@react-navigation/native';
import {isSignedIn, getValidGfnJwt} from '../gfn/auth';
import {useGfnSignIn} from '../gfn/useGfnSignIn';
import GfnSignInModal from '../components/GfnSignInModal';
import {fetchGfnAppDetails, GfnAppDetails} from '../gfn/catalog';
import {CatalogTitle} from '../catalog/unifiedCatalog';
import {getCatalogPreference} from '../store/catalogPreferences';
import {launchWithProvider} from '../catalog/launchCatalogTitle';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {getTitleProductId} from '../store/shortcutStore';
import {getFreshPriceCache} from '../store/priceStore';
import {
  isCatalogTitleFavorite,
  setCatalogTitleFavorite,
} from '../store/catalogFavorites';
import {
  PriceInfo,
  RatingInfo,
  TitleDetails,
  fetchTitleDetails,
  deriveMarketLanguage,
  getPrice,
  formatPrice,
  discountPercent,
  isSaleForDisplay,
} from '../utils/storePrice';
import {
  fetchSteamPrices,
  SteamPriceInfo,
  isSteamSaleForDisplay,
} from '../utils/steamPrice';
import {CAP_META, capLabel, renderStars} from '../utils/titleCapabilities';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const DIM_ICON_BG = 'rgba(140,140,150,0.16)';
const DIM_TEXT = '#8A9A92';

// A title's detail screen: rich info first (xCloud's own rich fields, with
// GFN's filling gaps), then "Play on" -- every provider it's actually
// available through, expanding into store choices for GFN when there's more
// than one. Each row dims when it isn't actually playable today (no Game
// Pass entitlement / not an owned GFN store variant). Picking any option
// remembers the choice for the Library grid's next tap on this title.
function LibraryTitleDetailScreen() {
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
  // xCloud one. See store/catalogFavorites.ts.
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
    fetchSteamPrices(steamAppIds).then(result => {
      if (!cancelled) {
        setSteamPrices(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogTitle?.gfn]);

  if (!catalogTitle) {
    return null;
  }

  const playXcloud = () => {
    launchWithProvider(navigation, catalogTitle, {provider: 'xcloud'});
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

  const gfnVariants = catalogTitle.gfn?.variants ?? [];
  const gfnAnyOwned = gfnVariants.some(variant => variant.owned);
  const isPreferredXcloud = preference?.provider === 'xcloud';
  const isPreferredGfnVariant = (id: string, store: string) =>
    preference?.provider === 'gfn' &&
    preference.gfnId === id &&
    preference.store === store;

  const genres =
    catalogTitle.genres.length > 0
      ? catalogTitle.genres
      : gfnDetails?.genres ?? [];
  const description =
    details?.description ||
    gfnDetails?.longDescription ||
    gfnDetails?.shortDescription ||
    '';
  const developer = details?.developer || gfnDetails?.developerName;
  const publisher = details?.publisher || gfnDetails?.publisherName;
  const screenshots = details?.screenshots?.length
    ? details.screenshots
    : gfnDetails?.screenshots ?? [];
  const trailer = details?.trailers?.[0];
  const hasMedia = !!trailer || screenshots.length > 0;

  const xcloudEntitled = !!catalogTitle.xcloud?.hasEntitlement;
  const xcloudDiscount =
    price && isSaleForDisplay(price) ? discountPercent(price) : 0;

  return (
    <ScrollView
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {catalogTitle.imageUrl ? (
          <Image
            source={{uri: catalogTitle.imageUrl}}
            resizeMode="cover"
            style={styles.heroImage}
          />
        ) : null}
        <Pressable
          style={styles.favoriteBtn}
          onPress={toggleFavorite}
          accessibilityLabel={t('LibraryFilterFavorite')}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite ? '#ff5347' : '#fff'}
          />
        </Pressable>
        <View style={styles.heroOverlay}>
          <Text style={styles.heroTitle}>{catalogTitle.title}</Text>
          {genres.length > 0 && (
            <Text style={styles.heroMeta}>
              {genres.slice(0, 3).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {rating && (
          <View style={styles.ratingRow}>
            <View style={styles.starsRow}>{renderStars(rating.average)}</View>
            <Text style={styles.ratingNum}>{rating.average.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>
              ({rating.count.toLocaleString()})
            </Text>
          </View>
        )}

        {(developer || publisher) && (
          <View style={styles.metaRow}>
            {developer ? (
              <View style={styles.metaCol}>
                <Text style={styles.metaKey}>{t('Developer')}</Text>
                <Text style={styles.metaVal}>{developer}</Text>
              </View>
            ) : null}
            {publisher ? (
              <View style={styles.metaCol}>
                <Text style={styles.metaKey}>{t('Publisher')}</Text>
                <Text style={styles.metaVal}>{publisher}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View>
          <Text style={styles.sectionLabel}>{t('PlayOn')}</Text>

          {catalogTitle.xcloud && (
            <View style={[styles.providerCard, styles.providerCardSpaced]}>
              <Pressable
                style={[styles.providerRow, !xcloudEntitled && styles.dimRow]}
                onPress={playXcloud}>
                <View
                  style={[
                    styles.providerIcon,
                    xcloudEntitled ? styles.xcloudIconBg : styles.dimIconBg,
                  ]}>
                  <Text
                    style={[
                      styles.providerIconText,
                      {color: xcloudEntitled ? XBOX_ACCENT : DIM_TEXT},
                    ]}>
                    X
                  </Text>
                </View>
                <View style={styles.providerText}>
                  <Text style={styles.providerName}>Xbox Cloud Gaming</Text>
                  <Text style={styles.providerSub}>
                    {xcloudEntitled
                      ? t('IncludedWithGamePass')
                      : t('LibraryViewDetails')}
                  </Text>
                  {!xcloudEntitled && price && (
                    <View style={styles.priceRow}>
                      <Text
                        style={[
                          styles.priceNow,
                          xcloudDiscount > 0 && styles.priceNowSale,
                        ]}>
                        {formatPrice(price.listPrice, price.currencyCode)}
                      </Text>
                      {xcloudDiscount > 0 && (
                        <Text style={styles.priceWas}>
                          {formatPrice(price.msrp, price.currencyCode)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                {isPreferredXcloud && (
                  <Icon source="check-circle" size={18} color={XBOX_ACCENT} />
                )}
                <Icon source="chevron-right" size={18} color="#8A9A92" />
              </Pressable>
            </View>
          )}

          {catalogTitle.gfn && (
            <View style={styles.providerCard}>
              <Pressable
                style={[styles.providerRow, !gfnAnyOwned && styles.dimRow]}
                onPress={() =>
                  gfnVariants.length > 1
                    ? setGfnExpanded(v => !v)
                    : playGfnVariant(gfnVariants[0])
                }>
                <View
                  style={[
                    styles.providerIcon,
                    gfnAnyOwned ? styles.gfnIconBg : styles.dimIconBg,
                  ]}>
                  <Text
                    style={[
                      styles.providerIconText,
                      {color: gfnAnyOwned ? NVIDIA_ACCENT : DIM_TEXT},
                    ]}>
                    N
                  </Text>
                </View>
                <View style={styles.providerText}>
                  <Text style={styles.providerName}>GeForce NOW</Text>
                  <Text style={styles.providerSub}>
                    {gfnVariants.length > 1
                      ? t('LibraryStoreCount', {n: gfnVariants.length})
                      : gfnVariants[0]?.store}
                  </Text>
                </View>
                {preference?.provider === 'gfn' && (
                  <Icon source="check-circle" size={18} color={NVIDIA_ACCENT} />
                )}
                <Icon
                  source={
                    gfnVariants.length > 1
                      ? gfnExpanded
                        ? 'chevron-up'
                        : 'chevron-down'
                      : 'chevron-right'
                  }
                  size={18}
                  color="#8A9A92"
                />
              </Pressable>

              {gfnVariants.length > 1 && gfnExpanded && (
                <View style={styles.stores}>
                  {gfnVariants.map(variant => {
                    const steamPrice = variant.steamAppId
                      ? steamPrices[variant.steamAppId]
                      : undefined;
                    const showSaleBadge =
                      !variant.owned && isSteamSaleForDisplay(steamPrice);
                    return (
                      <Pressable
                        key={`${variant.store}:${variant.id}`}
                        style={[
                          styles.storeRow,
                          !variant.owned && styles.dimRow,
                        ]}
                        onPress={() => playGfnVariant(variant)}>
                        <View style={styles.storeMark}>
                          <Text style={styles.storeMarkText}>
                            {variant.store.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.storeName}>{variant.store}</Text>
                        <View style={styles.storeRowEnd}>
                          {variant.owned && (
                            <Text style={styles.ownedText}>
                              {t('GfnOwned')}
                            </Text>
                          )}
                          {showSaleBadge && (
                            <View style={styles.saleBadge}>
                              <Text style={styles.saleBadgeText}>
                                -{steamPrice!.discountPercent}%
                              </Text>
                            </View>
                          )}
                          {isPreferredGfnVariant(variant.id, variant.store) && (
                            <Icon
                              source="check-circle"
                              size={16}
                              color={NVIDIA_ACCENT}
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {preference && (
            <Text style={styles.rememberedNote}>{t('RememberedChoice')}</Text>
          )}
        </View>

        {details?.capabilities?.length ? (
          <View>
            <Text style={styles.secTitle}>{t('Features')}</Text>
            <View style={styles.chips}>
              {details.capabilities.map(id => (
                <View style={styles.chip} key={id}>
                  <Ionicons
                    name={CAP_META[id]?.icon || 'ellipse-outline'}
                    size={13}
                    color="#3ad46b"
                  />
                  <Text style={styles.chipText}>{capLabel(t, id)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {hasMedia && (
          <View>
            <Text style={styles.secTitle}>{t('Media')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRail}>
              {trailer && (
                <View style={styles.mediaShotWrap}>
                  <Text style={styles.mediaSrc}>MSFT STORE</Text>
                  {trailer.preview ? (
                    <Image
                      source={{uri: trailer.preview}}
                      resizeMode="cover"
                      style={styles.mediaShot}
                    />
                  ) : (
                    <View style={[styles.mediaShot, styles.trailerFallback]} />
                  )}
                  <View style={styles.playBtn}>
                    <Ionicons name="play" size={18} color="#fff" />
                  </View>
                </View>
              )}
              {screenshots.map((uri, idx) => (
                <View style={styles.mediaShotWrap} key={uri || idx}>
                  {idx === 0 && (
                    <Text style={styles.mediaSrc}>
                      {details?.screenshots?.length ? 'MSFT STORE' : 'GFN'}
                    </Text>
                  )}
                  <Image
                    source={{uri}}
                    resizeMode="cover"
                    style={styles.mediaShot}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {description ? (
          <View>
            <Text style={styles.secTitle}>{t('Description')}</Text>
            <Text style={styles.description} numberOfLines={6}>
              {description}
            </Text>
          </View>
        ) : null}
      </View>

      <GfnSignInModal
        visible={loginVisible}
        status={loginStatus}
        challenge={challenge}
        onRetry={retryLogin}
        onCancel={cancelLogin}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingBottom: 32},
  hero: {aspectRatio: 16 / 9, justifyContent: 'flex-end'},
  heroImage: {...StyleSheet.absoluteFillObject},
  favoriteBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(5,6,8,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTitle: {fontSize: 22, fontWeight: '800', color: '#fff'},
  heroMeta: {fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2},
  body: {padding: 16, gap: 16},
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  starsRow: {flexDirection: 'row'},
  ratingNum: {fontSize: 13, fontWeight: '700'},
  ratingCount: {fontSize: 11.5, color: '#8A9A92'},
  metaRow: {flexDirection: 'row', gap: 24},
  metaCol: {gap: 1},
  metaKey: {fontSize: 10.5, color: '#8A9A92', textTransform: 'uppercase'},
  metaVal: {fontSize: 13, fontWeight: '600'},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A9A92',
  },
  secTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A9A92',
    marginBottom: 8,
  },
  providerCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(140,140,150,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.2)',
  },
  providerCardSpaced: {marginTop: 8, marginBottom: 8},
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  dimRow: {opacity: 0.55},
  providerIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xcloudIconBg: {backgroundColor: 'rgba(16,124,16,0.18)'},
  gfnIconBg: {backgroundColor: 'rgba(118,185,0,0.18)'},
  dimIconBg: {backgroundColor: DIM_ICON_BG},
  providerIconText: {fontWeight: '800', fontSize: 13},
  providerText: {flex: 1, gap: 1},
  providerName: {fontSize: 14, fontWeight: '700'},
  providerSub: {fontSize: 11.5, color: '#8A9A92'},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  priceNow: {fontSize: 12.5, fontWeight: '800'},
  priceNowSale: {color: '#ff5347'},
  priceWas: {
    fontSize: 11,
    color: '#8A9A92',
    textDecorationLine: 'line-through',
  },
  stores: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(140,140,150,0.2)',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 22,
  },
  storeMark: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(140,140,150,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMarkText: {fontSize: 9, fontWeight: '800', color: '#8A9A92'},
  storeName: {flex: 1, fontSize: 13, fontWeight: '600'},
  storeRowEnd: {flexDirection: 'row', alignItems: 'center', gap: 6},
  ownedText: {fontSize: 11, fontWeight: '700', color: NVIDIA_ACCENT},
  saleBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: '#ff9a3c',
  },
  saleBadgeText: {fontSize: 10, fontWeight: '800', color: '#2b1400'},
  rememberedNote: {
    fontSize: 11.5,
    color: '#8A9A92',
    textAlign: 'center',
    marginTop: 8,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.2)',
  },
  chipText: {fontSize: 11.5, fontWeight: '600'},
  mediaRail: {gap: 8},
  mediaShotWrap: {position: 'relative'},
  mediaShot: {
    width: 150,
    height: 94,
    borderRadius: 8,
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  mediaSrc: {
    position: 'absolute',
    left: 5,
    top: 5,
    zIndex: 1,
    fontSize: 8,
    fontWeight: '800',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(5,6,8,0.6)',
    color: 'rgba(255,255,255,0.85)',
  },
  trailerFallback: {backgroundColor: 'rgba(140,140,150,0.2)'},
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -19,
    marginLeft: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16,124,16,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {fontSize: 13, lineHeight: 19, color: '#B7C6BD'},
});

export default LibraryTitleDetailScreen;
