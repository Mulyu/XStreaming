import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  TextInput,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import XcloudApi from '../xCloud';
import {
  GfnGame,
  fetchGfnGames,
  getFreshGfnGames,
  getCachedGfnGames,
} from '../gfn/publicGames';
import {isSignedIn, getValidGfnJwt} from '../gfn/auth';
import {
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  mergeOwnedGames,
  fetchGfnCatalogOrder,
  GFN_SORT_MOST_POPULAR,
  GFN_SORT_LAST_ADDED,
} from '../gfn/catalog';
import {
  buildUnifiedCatalog,
  isCatalogTitleOwned,
  CatalogTitle,
} from '../catalog/unifiedCatalog';
import {getCatalogPreference} from '../store/catalogPreferences';
import {getFavoriteKeys} from '../store/catalogFavorites';
import {
  launchWithProvider,
  isPreferenceAvailable,
} from '../catalog/launchCatalogTitle';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {getXcloudData, saveXcloudData} from '../store/xcloudStore';
import {
  getFreshPriceCache,
  savePriceCache,
  getFreshPopularOrder,
  savePopularOrder,
} from '../store/priceStore';
import {getFreshGfnRankOrder, saveGfnRankOrder} from '../store/gfnRankStore';
import {fetchPopularOrder, buildPopularRank} from '../utils/popularOrder';
import {
  PriceInfo,
  deriveMarketLanguage,
  fetchPricesWithRetry,
  getPrice,
  isSaleForDisplay,
  discountPercent,
} from '../utils/storePrice';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const SALE_ACCENT = '#E67E22';

type SortMode = 'reco' | 'newest' | 'popular' | 'recent';

const EMPTY_PRICE_MAP: Record<string, PriceInfo> = {};
const EMPTY_RANK: Record<string, number> = {};

// The single "Library" tab: xCloud and GeForce NOW titles merged by name into
// one grid. A title with entries on both services still gets one card; which
// provider (and, for GFN, which linked store) to actually play it on is
// decided on the title's own detail screen, not here.
function LibraryScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>([]);
  const [gfnPublicGames, setGfnPublicGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );
  const [gfnOwnedGames, setGfnOwnedGames] = React.useState<GfnGame[]>(
    () => getFreshOwnedGames() || [],
  );
  const [loading, setLoading] = React.useState(true);
  const [keyword, setKeyword] = React.useState('');
  const [sortMode, setSortMode] = React.useState<SortMode>('reco');
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);

  // xCloud-only enrichment for the sale badge and the Sale/Newest/Popular
  // sorts -- GFN has no equivalent price, release-date or popularity data on
  // the public catalog path this screen reads (see the Library mock's own
  // notes), so these stay empty for GFN titles rather than faking a value.
  const [priceMap, setPriceMap] =
    React.useState<Record<string, PriceInfo>>(EMPTY_PRICE_MAP);
  const [popularRank, setPopularRank] =
    React.useState<Record<string, number>>(EMPTY_RANK);
  const [releaseDates, setReleaseDates] = React.useState<
    Record<string, string>
  >(() => getXcloudData()?.releaseDates || {});

  // GFN's own catalog-wide "Most Popular"/"Newest" order -- confirmed live
  // against GFN's real sort-definitions endpoint -- so those two sorts can
  // rank titles from both services on the same footing instead of being
  // xCloud-only. Requires a signed-in GFN token; stays empty otherwise.
  const [gfnPopularRank, setGfnPopularRank] =
    React.useState<Record<string, number>>(EMPTY_RANK);
  const [gfnNewestRank, setGfnNewestRank] =
    React.useState<Record<string, number>>(EMPTY_RANK);
  // xCloud's own "recently played" order (MRU), for the Recently Played sort.
  const [xcloudRecentRank, setXcloudRecentRank] =
    React.useState<Record<string, number>>(EMPTY_RANK);

  // Filter chips: provider (OR between active ones; neither active = all)
  // plus Favorite/Owned/On Sale, each an independent AND filter. Owned
  // defaults on; the rest default off.
  const [filterXcloud, setFilterXcloud] = React.useState(false);
  const [filterGfn, setFilterGfn] = React.useState(false);
  const [filterFavorite, setFilterFavorite] = React.useState(false);
  const [filterOwnedOnly, setFilterOwnedOnly] = React.useState(true);
  const [filterOnSale, setFilterOnSale] = React.useState(false);

  // Favorites live in their own catalog-key-based store (not tied to one
  // provider) so a GFN-only title can be favorited too -- reloaded on focus
  // since toggling one happens on the title detail screen, a separate
  // screen instance.
  const [favoriteKeys, setFavoriteKeys] = React.useState<Set<string>>(
    () => new Set(getFavoriteKeys()),
  );
  useFocusEffect(
    React.useCallback(() => {
      setFavoriteKeys(new Set(getFavoriteKeys()));
    }, []),
  );

  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();

  React.useEffect(() => {
    if (typeof route.params?.keyword === 'string') {
      setKeyword(route.params.keyword);
    }
  }, [route.params?.keyword]);

  // xCloud: title list + Game Pass entitlement. Deliberately not the full
  // Cloud.tsx pipeline (rating/leaving-soon/favorites/ignore) -- this grid
  // only needs enough to show a card, hand off to TitleDetail, and (below)
  // enrich with the same price/popularity/release-date sources Cloud.tsx
  // used, for the sale badge and the Sale/Newest/Popular sorts.
  React.useEffect(() => {
    if (!streamingTokens?.xCloudToken) {
      return;
    }
    const api = new XcloudApi(
      streamingTokens.xCloudToken.getDefaultRegion().baseUri,
      streamingTokens.xCloudToken.data.gsToken,
      'cloud',
    );
    api.getTitles().then((res: any) => {
      if (res?.results?.length > 0) {
        api.getGamePassProducts(res.results).then(setXcloudTitles);
      }
    });
  }, [streamingTokens?.xCloudToken]);

  // Store prices + sale status, batched and cached (24h) exactly like
  // Cloud.tsx's price fetch.
  const priceSigRef = React.useRef('');
  React.useEffect(() => {
    const productIds = xcloudTitles
      .map((item: any) => item.productId)
      .filter(Boolean);
    if (productIds.length === 0) {
      return;
    }
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    const sig = `${market}:${productIds.length}`;
    if (priceSigRef.current === sig) {
      return;
    }
    priceSigRef.current = sig;

    const cache = getFreshPriceCache(market);
    if (cache) {
      setPriceMap(cache.priceMap);
    }

    fetchPricesWithRetry(productIds, market, language).then(
      ({prices, ratings, ok}) => {
        if (Object.keys(prices).length > 0) {
          setPriceMap(prev => ({...prev, ...prices}));
        }
        if (ok) {
          savePriceCache(prices, ratings, market, sig);
        } else {
          priceSigRef.current = '';
        }
      },
    );
  }, [xcloudTitles, gameLanguage, deviceRegion]);

  // "Most popular on cloud" ranking, cached (24h) exactly like Cloud.tsx.
  const popularMarketRef = React.useRef('');
  React.useEffect(() => {
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    if (popularMarketRef.current === market) {
      return;
    }
    popularMarketRef.current = market;

    const cached = getFreshPopularOrder(market);
    if (cached) {
      setPopularRank(buildPopularRank(cached));
      return;
    }

    fetchPopularOrder(market, language).then(order => {
      if (order === null) {
        popularMarketRef.current = '';
        return;
      }
      savePopularOrder(order, market);
      setPopularRank(buildPopularRank(order));
    });
  }, [gameLanguage, deviceRegion]);

  // Release dates from the Microsoft display catalog (the Game Pass
  // hydration carries none), cached alongside the rest of the xCloud blob.
  React.useEffect(() => {
    const productIds = xcloudTitles
      .map((item: any) => item.productId)
      .filter(Boolean);
    const missingIds = productIds.filter((id: string) => !releaseDates[id]);
    if (missingIds.length === 0) {
      return;
    }
    const api = new XcloudApi('', '', 'cloud');
    api.getReleaseDates(missingIds).then(fetched => {
      if (Object.keys(fetched).length === 0) {
        return;
      }
      setReleaseDates(prev => {
        const merged = {...prev, ...fetched};
        saveXcloudData({...getXcloudData(), releaseDates: merged});
        return merged;
      });
    });
    // Only productIds should re-trigger this -- releaseDates itself changes
    // as a result of this effect and must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xcloudTitles]);

  // xCloud's own recently-played order (MRU, up to 25), for "Recently
  // played". Not cached -- MRU should reflect genuinely recent activity, not
  // a stale snapshot.
  React.useEffect(() => {
    if (!streamingTokens?.xCloudToken) {
      return;
    }
    const api = new XcloudApi(
      streamingTokens.xCloudToken.getDefaultRegion().baseUri,
      streamingTokens.xCloudToken.data.gsToken,
      'cloud',
    );
    api.getRecentTitles().then((res: any) => {
      const ids = (res?.results ?? [])
        .map((item: any) => item?.details?.productId)
        .filter(Boolean)
        .map((id: string) => id.toUpperCase());
      if (ids.length > 0) {
        setXcloudRecentRank(buildPopularRank(ids));
      }
    });
  }, [streamingTokens?.xCloudToken]);

  // GFN: public catalog (no sign-in needed) + the signed-in user's owned
  // library merged in, exactly as GfnLibrary did.
  const loadGfnPublic = React.useCallback((force = false) => {
    if (!force) {
      const fresh = getFreshGfnGames();
      if (fresh) {
        setGfnPublicGames(fresh);
        return;
      }
    }
    fetchGfnGames()
      .then(setGfnPublicGames)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadGfnPublic();
  }, [loadGfnPublic]);

  React.useEffect(() => {
    if (!isSignedIn()) {
      return;
    }
    getValidGfnJwt().then(token => {
      if (!token) {
        return;
      }
      fetchGfnOwnedGames(token)
        .then(owned => owned.length > 0 && setGfnOwnedGames(owned))
        .catch(() => {});
    });
  }, []);

  // GFN's catalog-wide Most Popular / Newest order, cached (24h). Requires a
  // signed-in token -- GFN's catalog-browse endpoint doesn't serve this
  // anonymously (same precondition as the owned-library query above) -- so
  // these two sorts simply stay xCloud-only while signed out.
  React.useEffect(() => {
    if (!isSignedIn()) {
      return;
    }
    const cachedPopular = getFreshGfnRankOrder('popular');
    if (cachedPopular) {
      setGfnPopularRank(buildPopularRank(cachedPopular));
    }
    const cachedNewest = getFreshGfnRankOrder('newest');
    if (cachedNewest) {
      setGfnNewestRank(buildPopularRank(cachedNewest));
    }
    if (cachedPopular && cachedNewest) {
      return;
    }
    getValidGfnJwt().then(token => {
      if (!token) {
        return;
      }
      if (!cachedPopular) {
        fetchGfnCatalogOrder(token, GFN_SORT_MOST_POPULAR).then(order => {
          if (order.length > 0) {
            saveGfnRankOrder('popular', order);
            setGfnPopularRank(buildPopularRank(order));
          }
        });
      }
      if (!cachedNewest) {
        fetchGfnCatalogOrder(token, GFN_SORT_LAST_ADDED).then(order => {
          if (order.length > 0) {
            saveGfnRankOrder('newest', order);
            setGfnNewestRank(buildPopularRank(order));
          }
        });
      }
    });
  }, []);

  React.useEffect(() => {
    // Nothing to actually await -- both fetches above resolve independently
    // and paint as they arrive. This just clears the initial spinner once
    // we've had a chance to show cached GFN data (xCloud may still be
    // loading quietly in the background if this is the very first fetch).
    setLoading(false);
  }, []);

  const gfnGames = React.useMemo(
    () => mergeOwnedGames(gfnPublicGames, gfnOwnedGames),
    [gfnPublicGames, gfnOwnedGames],
  );

  // gfnOwnedGames arrives in the server's own lastPlayed/added order (see
  // gfn/catalog.ts) -- turn that position into a rank map the same way
  // xCloud's own recent/popular orders already are.
  const gfnRecentRank = React.useMemo(
    () => buildPopularRank(gfnOwnedGames.map(g => g.id)),
    [gfnOwnedGames],
  );

  // xCloud release dates, turned into an ordinal rank (0 = newest known
  // date) so they combine fairly with GFN's ordinal "last added" rank --
  // comparing a real timestamp against a catalog position wouldn't mean
  // anything, but comparing two positions does.
  const xcloudNewestRank = React.useMemo(() => {
    const withDates = xcloudTitles
      .map((item: any) => ({
        id: item.productId as string | undefined,
        ms: item.productId
          ? new Date(releaseDates[item.productId] || '').getTime()
          : NaN,
      }))
      .filter(x => x.id && Number.isFinite(x.ms))
      .sort((a, b) => b.ms - a.ms);
    const rank: Record<string, number> = {};
    withDates.forEach((x, i) => {
      if (rank[x.id!] === undefined) {
        rank[x.id!] = i;
      }
    });
    return rank;
  }, [xcloudTitles, releaseDates]);

  const catalog = React.useMemo(
    () => buildUnifiedCatalog(xcloudTitles, gfnGames),
    [xcloudTitles, gfnGames],
  );

  // xCloud-only discount percent for the sale badge/filter; 0 for anything
  // not on sale (or not on xCloud at all).
  const saleDiscount = React.useCallback(
    (item: CatalogTitle): number => {
      const productId = item.xcloud?.raw?.productId;
      if (!productId) {
        return 0;
      }
      const price = getPrice(priceMap, productId);
      return price && isSaleForDisplay(price) ? discountPercent(price) : 0;
    },
    [priceMap],
  );

  const providerOwnedFiltered = React.useMemo(() => {
    let list = catalog;
    if (filterXcloud || filterGfn) {
      list = list.filter(
        item => (filterXcloud && item.xcloud) || (filterGfn && item.gfn),
      );
    }
    if (filterFavorite) {
      list = list.filter(item => favoriteKeys.has(item.key));
    }
    if (filterOwnedOnly) {
      list = list.filter(isCatalogTitleOwned);
    }
    if (filterOnSale) {
      list = list.filter(item => saleDiscount(item) > 0);
    }
    return list;
  }, [
    catalog,
    filterXcloud,
    filterGfn,
    filterFavorite,
    favoriteKeys,
    filterOwnedOnly,
    filterOnSale,
    saleDiscount,
  ]);

  const filtered = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) {
      return providerOwnedFiltered;
    }
    return providerOwnedFiltered.filter(item =>
      item.title.toLowerCase().includes(q),
    );
  }, [providerOwnedFiltered, keyword]);

  // Combines a title's xCloud rank and GFN rank (each an ordinal position
  // within that provider's own ordered list -- see the two memos above and
  // the two GFN fetch effects) into one rank: whichever provider ranks it
  // more favorably, so a single mixed list can sort by it. A title present
  // on only one provider just uses that provider's rank; absent from both,
  // it sorts last.
  const mergedRankOf = React.useCallback(
    (
      item: CatalogTitle,
      xRank: Record<string, number>,
      gRank: Record<string, number>,
      upperXKey: boolean,
    ): number => {
      const xId = item.xcloud?.raw?.productId;
      const xR = xId ? xRank[upperXKey ? xId.toUpperCase() : xId] : undefined;
      const gIds = item.gfn?.variants.map(v => v.id) ?? [];
      const gRs = gIds
        .map(id => gRank[id])
        .filter((r): r is number => r !== undefined);
      const gR = gRs.length > 0 ? Math.min(...gRs) : undefined;
      if (xR === undefined && gR === undefined) {
        return Number.MAX_SAFE_INTEGER;
      }
      if (xR === undefined) {
        return gR!;
      }
      if (gR === undefined) {
        return xR;
      }
      return Math.min(xR, gR);
    },
    [],
  );

  const sorted = React.useMemo(() => {
    if (sortMode === 'reco') {
      return filtered;
    }
    const list = [...filtered];
    if (sortMode === 'newest') {
      list.sort(
        (a, b) =>
          mergedRankOf(a, xcloudNewestRank, gfnNewestRank, false) -
            mergedRankOf(b, xcloudNewestRank, gfnNewestRank, false) ||
          a.title.localeCompare(b.title),
      );
    } else if (sortMode === 'popular') {
      list.sort(
        (a, b) =>
          mergedRankOf(a, popularRank, gfnPopularRank, true) -
            mergedRankOf(b, popularRank, gfnPopularRank, true) ||
          a.title.localeCompare(b.title),
      );
    } else if (sortMode === 'recent') {
      list.sort(
        (a, b) =>
          mergedRankOf(a, xcloudRecentRank, gfnRecentRank, true) -
            mergedRankOf(b, xcloudRecentRank, gfnRecentRank, true) ||
          a.title.localeCompare(b.title),
      );
    }
    return list;
  }, [
    filtered,
    sortMode,
    mergedRankOf,
    xcloudNewestRank,
    gfnNewestRank,
    popularRank,
    gfnPopularRank,
    xcloudRecentRank,
    gfnRecentRank,
  ]);

  const sortOptions: {value: SortMode; label: string; scope: string}[] = [
    {value: 'reco', label: t('Recommended'), scope: ''},
    {value: 'newest', label: t('SortNewest'), scope: ''},
    {value: 'popular', label: t('Popular'), scope: ''},
    {value: 'recent', label: t('SortRecent'), scope: ''},
  ];
  const activeSortLabel =
    sortOptions.find(o => o.value === sortMode)?.label || t('Recommended');

  // Square-tile grid: denser than the old 16:10 cards, so a smaller target
  // width per column is intentional here (was 260/300).
  const isLandscape = screenWidth > screenHeight;
  const numColumns = React.useMemo(() => {
    const target = isLandscape || Platform.isTV ? 150 : 110;
    return Math.max(2, Math.min(8, Math.floor(screenWidth / target)));
  }, [isLandscape, screenWidth]);

  const openTitle = React.useCallback(
    (item: CatalogTitle) => {
      const preference = getCatalogPreference(item.key);
      if (preference && isPreferenceAvailable(item, preference)) {
        launchWithProvider(navigation, item, preference);
        return;
      }
      navigation.navigate('LibraryTitleDetail', {catalogTitle: item});
    },
    [navigation],
  );

  const renderCard = ({item}: {item: CatalogTitle}) => {
    // Cover art itself grays out when the title isn't playable via any of
    // its listed services today (no Game Pass entitlement, no owned GFN
    // store variant) -- the X/N badges stay their normal color regardless,
    // since they answer "which service" rather than "playable right now".
    const isPlayable = isCatalogTitleOwned(item);
    const discount = saleDiscount(item);

    return (
      <View style={[styles.cell, {width: `${100 / numColumns}%`}]}>
        <Pressable
          style={styles.card}
          onPress={() => openTitle(item)}
          android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
          {item.imageUrl ? (
            <Image
              source={{uri: item.imageUrl}}
              resizeMode="cover"
              style={styles.thumb}
            />
          ) : (
            <View style={styles.thumbEmpty}>
              <Text style={styles.thumbEmptyText} numberOfLines={3}>
                {item.title}
              </Text>
            </View>
          )}

          {!isPlayable && <View style={styles.coverDim} pointerEvents="none" />}
          <View style={styles.bottomScrim} pointerEvents="none" />

          <View style={styles.availOverlay}>
            {item.xcloud && (
              <View style={[styles.availDot, {backgroundColor: XBOX_ACCENT}]}>
                <Text style={styles.availDotText}>X</Text>
              </View>
            )}
            {item.gfn && (
              <View style={[styles.availDot, {backgroundColor: NVIDIA_ACCENT}]}>
                <Text style={styles.availDotText}>N</Text>
              </View>
            )}
          </View>

          {discount > 0 && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleBadgeText}>-{discount}%</Text>
            </View>
          )}

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('Library')}</Text>
          {catalog.length > 0 && (
            <Text style={styles.count}>
              {filtered.length}/{catalog.length}
            </Text>
          )}
        </View>
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color="#8A9A92" />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder={t('Search')}
            placeholderTextColor="#8A9A92"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.filterRow}>
          <View style={styles.chipsRow}>
            <Pressable
              style={[styles.filterChip, filterXcloud && styles.filterChipOn]}
              onPress={() => setFilterXcloud(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterXcloud && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterXcloud')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterGfn && styles.filterChipOn]}
              onPress={() => setFilterGfn(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterGfn && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterGfn')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterFavorite && styles.filterChipOn]}
              onPress={() => setFilterFavorite(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterFavorite && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterFavorite')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.filterChip,
                filterOwnedOnly && styles.filterChipOn,
              ]}
              onPress={() => setFilterOwnedOnly(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterOwnedOnly && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterOwned')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterOnSale && styles.filterChipOn]}
              onPress={() => setFilterOnSale(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterOnSale && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterOnSale')}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.sortChip,
                sortMode !== 'reco' && styles.sortChipOn,
              ]}
              onPress={() => setSortMenuOpen(v => !v)}>
              <Text
                style={[
                  styles.sortChipText,
                  sortMode !== 'reco' && styles.sortChipTextOn,
                ]}>
                {`${t('Sort')}: ${activeSortLabel}`}
              </Text>
              <Icon
                source={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={sortMode !== 'reco' ? '#0B0F0C' : '#8A9A92'}
              />
            </Pressable>
          </View>

          {sortMenuOpen && (
            <View style={styles.sortMenu}>
              {sortOptions.map(option => (
                <Pressable
                  key={option.value}
                  style={styles.sortItem}
                  onPress={() => {
                    setSortMode(option.value);
                    setSortMenuOpen(false);
                  }}>
                  <View style={styles.sortItemLabelRow}>
                    {sortMode === option.value && (
                      <Icon source="check" size={13} color={NVIDIA_ACCENT} />
                    )}
                    <Text style={styles.sortItemLabel}>{option.label}</Text>
                  </View>
                  {!!option.scope && (
                    <Text style={styles.sortItemScope}>{option.scope}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {loading && catalog.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={item => item.key}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          initialNumToRender={18}
          windowSize={11}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {fontSize: 18, fontWeight: '800'},
  count: {fontSize: 12, fontWeight: '700', color: '#8A9A92'},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  searchInput: {flex: 1, padding: 0, fontSize: 14, color: '#E6ECE8'},
  filterRow: {position: 'relative'},
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  filterChipOn: {backgroundColor: XBOX_ACCENT, borderColor: XBOX_ACCENT},
  filterChipText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  filterChipTextOn: {color: '#0B0F0C'},
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  sortChipOn: {backgroundColor: NVIDIA_ACCENT, borderColor: NVIDIA_ACCENT},
  sortChipText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  sortChipTextOn: {color: '#0B0F0C'},
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    width: 230,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,32,36,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
    zIndex: 10,
    elevation: 10,
  },
  sortItem: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(140,140,150,0.16)',
    gap: 2,
  },
  sortItemLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  sortItemLabel: {fontSize: 13, fontWeight: '700'},
  sortItemScope: {fontSize: 10, color: '#8A9A92', paddingLeft: 18},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  centreText: {color: '#8A9A92', fontSize: 14},
  list: {paddingHorizontal: 6, paddingBottom: 20},
  cell: {padding: 4},
  // Square-cropped tile: the card IS the art, badges/title overlay on top of
  // it so more titles fit on screen at once (was a 16:10 card + text footer).
  card: {
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  thumb: {...StyleSheet.absoluteFillObject},
  thumbEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  thumbEmptyText: {
    color: '#B7C6BD',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Grays out the cover art (not the badges) when the title isn't playable
  // via any of its listed services right now.
  coverDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,21,24,0.6)',
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  availOverlay: {
    position: 'absolute',
    left: 5,
    top: 5,
    flexDirection: 'row',
    gap: 3,
  },
  availDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availDotText: {fontSize: 7.5, fontWeight: '800', color: '#0B0F0C'},
  saleBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: SALE_ACCENT,
  },
  saleBadgeText: {fontSize: 8.5, fontWeight: '800', color: '#2B1400'},
  cardTitle: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
});

export default LibraryScreen;
