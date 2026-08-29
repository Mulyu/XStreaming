import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Linking,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  Portal,
  Modal,
  Card,
  IconButton,
  Icon,
  Switch,
  Button,
} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {useSelector, useDispatch} from 'react-redux';
import TitleItem from '../components/TitleItem';
import XcloudApi from '../xCloud';
import Empty from '../components/Empty';
// import mockData from '../mock/data';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import {getSettings} from '../store/settingStore';
import {
  getXcloudData,
  saveXcloudData,
  isxCloudDataValid,
} from '../store/xcloudStore';
import {
  PriceInfo,
  RatingInfo,
  fetchPricesWithRetry,
  deriveMarketLanguage,
  getStoreUrl,
  getPrice,
  isSaleForDisplay,
} from '../utils/storePrice';
import {fetchPopularOrder, buildPopularRank} from '../utils/popularOrder';
import {fetchLeavingSoon, buildLeavingSoonSet} from '../utils/leavingSoon';
import {
  getFreshPriceCache,
  savePriceCache,
  getFreshPopularOrder,
  savePopularOrder,
  getFreshLeavingSoon,
  saveLeavingSoon,
} from '../store/priceStore';
import {getSystemRegion} from '../utils/locale';
import {getTitleProductId} from '../store/shortcutStore';

type SortMode = 'reco' | 'popular' | 'rating';

// Bayesian prior for the rating sort: shrink low-sample averages toward a
// neutral mean so a lone 5-star review can't top a highly-rated popular game.
const RATING_PRIOR_MEAN = 3.5;
const RATING_PRIOR_WEIGHT = 50;

// Stable empties so the list memo only depends on price/rating/popular data
// when a control actually uses it (avoids recompute on unrelated arrivals).
const EMPTY_PRICE_MAP: Record<string, PriceInfo> = {};
const EMPTY_RATING_MAP: Record<string, RatingInfo> = {};
const EMPTY_RANK: Record<string, number> = {};
const EMPTY_LIST: any[] = [];

const log = debugFactory('CloudScreen');

function CloudScreen({navigation, route}) {
  const {t, i18n} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const starTitles = useSelector((state: any) => state.stars || []);
  const ignoreTitles = useSelector((state: any) => state.ignores || []);

  const currentLanguage = i18n.language;
  // Read here (not just inside the price effect) so a change re-runs the effect.
  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();

  // Discovery and Settings now live in the bottom navigation bar, so the Cloud
  // header no longer carries those actions.

  // log.info('streamingTokens:', streamingTokens);

  const [current, setCurrent] = React.useState<any>(0);
  const [currentPage, setCurrentPage] = React.useState(1);

  const [loading, setLoading] = React.useState(false);
  const [loadmoring, setLoadmoring] = React.useState(false);
  const [isLimited, setIsLimited] = React.useState(false);
  const [showToturial, setShowToturial] = React.useState(false);
  const [titles, setTitles] = React.useState<any>([]);
  const [newTitles, setNewTitles] = React.useState([]);
  const [_titlesMap, setTitlesMap] = React.useState({});
  const [recentTitles, setRecentTitles] = React.useState([]);
  const [keyword, setKeyword] = React.useState('');
  const [playableOnly, setPlayableOnly] = React.useState(false);
  const [saleOnly, setSaleOnly] = React.useState(false);
  const [selectedGenre, setSelectedGenre] = React.useState('');
  const [sortMode, setSortMode] = React.useState<SortMode>('reco');
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [ratingMap, setRatingMap] = React.useState<Record<string, RatingInfo>>(
    {},
  );
  const [popularRank, setPopularRank] = React.useState<Record<string, number>>(
    {},
  );
  const popularMarketRef = React.useRef<string>('');
  const [leavingSoonSet, setLeavingSoonSet] = React.useState<Set<string>>(
    () => new Set(),
  );
  const leavingMarketRef = React.useRef<string>('');
  const filterChangedInSheetRef = React.useRef(false);
  const flatListRef = React.useRef<any>(null);
  const isFetchGame = React.useRef(false);
  const [priceMap, setPriceMap] = React.useState<Record<string, PriceInfo>>({});
  const [actionTitle, setActionTitle] = React.useState<any>(null);
  // Signature (market + title set) we have already fetched or are fetching
  // prices for. Cleared on failure so a later change can refetch.
  const priceSigRef = React.useRef<string>('');
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const totalPage = React.useRef(0);
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;
  const numColumns = React.useMemo(() => {
    if (!isLargeScreen && screenWidth < 640) {
      return 2;
    }
    const targetWidth = isLargeScreen ? 150 : 190;
    return Math.max(3, Math.min(8, Math.floor(screenWidth / targetWidth)));
  }, [isLargeScreen, screenWidth]);
  const pageSize = isLargeScreen ? 40 : 20;

  React.useEffect(() => {
    if (typeof route.params?.keyword === 'string') {
      setKeyword(route.params.keyword);
    }
    if (!streamingTokens.xCloudToken) {
      setIsLimited(true);
    }

    const fetchGames = (silent = false) => {
      if (silent) {
        log.info('Fetch games silent');
      }
      if (streamingTokens.xCloudToken) {
        const _xCloudApi = new XcloudApi(
          streamingTokens.xCloudToken.getDefaultRegion().baseUri,
          streamingTokens.xCloudToken.data.gsToken,
          'cloud',
        );

        !silent && setLoading(true);
        _xCloudApi.getTitles().then((res: any) => {
          // log.info('_xCloudApi.getTitles res: ', titles);
          if (res.results && res.results.length > 0) {
            _xCloudApi.getGamePassProducts(res.results).then(_titles => {
              setTitles(_titles);

              const _titleMap = {};

              _titles.forEach(item => {
                _titleMap[item.productId] = item;
              });

              setTitlesMap(_titleMap);

              // Get new games
              _xCloudApi.getNewTitles().then(newTitleRes => {
                const _newTitles: any = [];
                newTitleRes.forEach((item: any) => {
                  if (
                    item.id &&
                    _titleMap[item.id] &&
                    (_titleMap[item.id].titleId ||
                      _titleMap[item.id].XCloudTitleId)
                  ) {
                    _newTitles.push(_titleMap[item.id]);
                  }
                });
                setNewTitles(_newTitles);

                // Get recent games
                _xCloudApi.getRecentTitles().then((recentTitleRes: any) => {
                  const results = recentTitleRes.results || [];
                  const _recentTitles: any = [];
                  results.forEach(item => {
                    if (item.details && item.details.productId) {
                      const productId = item.details.productId;
                      const productIdUp = productId.toUpperCase();
                      if (_titleMap[productId] || _titleMap[productIdUp]) {
                        _recentTitles.push(
                          _titleMap[productId] || _titleMap[productIdUp],
                        );
                      }
                    }
                  });
                  setRecentTitles(_recentTitles);
                  setLoading(false);
                  isFetchGame.current = true;

                  // update cache
                  const cacheData = getXcloudData();
                  saveXcloudData({
                    ...cacheData,
                    titles: _titles,
                    titleMap: _titleMap,
                    newTitles: _newTitles,
                    recentTitles: _recentTitles,
                  });
                });
              });
            });
          }
        });
      }
    };

    if (!isFetchGame.current) {
      // Get xcloud data from cache
      const cacheData = getXcloudData();
      if (cacheData && isxCloudDataValid(cacheData)) {
        log.info('Get xcloud data from cache');
        let {
          titles: _titles,
          titleMap: _titleMap,
          newTitles: _newTitles,
          starTitles: _starTitles,
          ignoreTitles: _ignoreTitles,
          recentTitles: _recentTitles,
        } = cacheData;

        // Filter duplicate titles

        setTitles(_titles);
        setTitlesMap(_titleMap);
        setNewTitles(_newTitles);
        setRecentTitles(_recentTitles);

        dispatch({
          type: 'SET_STARS',
          payload: _starTitles,
        });
        dispatch({
          type: 'SET_IGNORES',
          payload: _ignoreTitles || [],
        });

        // Update silent
        fetchGames(true);
      } else {
        fetchGames();
      }
    }

    return () => {};
  }, [
    route.params?.keyword,
    streamingTokens.xCloudToken,
    navigation,
    dispatch,
  ]);

  const handleViewDetail = titleItem => {
    navigation.navigate('TitleDetail', {titleItem});
  };

  const isTitleStarred = (titleItem: any) =>
    !!titleItem &&
    (starTitles.includes(titleItem.XCloudTitleId) ||
      starTitles.includes(titleItem.titleId));

  const isTitleIgnored = (titleItem: any) =>
    !!titleItem &&
    (ignoreTitles.includes(titleItem.XCloudTitleId) ||
      ignoreTitles.includes(titleItem.titleId));

  const withoutTitle = (list: any[], titleItem: any) =>
    list.filter(
      (id: any) => id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
    );

  // Persist the star/ignore lists to the xcloud cache so they survive restarts.
  const persistLists = (nextStars: any[], nextIgnores: any[]) => {
    const cacheData = getXcloudData();
    if (cacheData) {
      cacheData.starTitles = nextStars;
      cacheData.ignoreTitles = nextIgnores;
      saveXcloudData(cacheData);
    }
  };

  // Toggle the favorite (star) state. Stars are keyed by XCloudTitleId to
  // match the detail-screen toggle, and persisted to the xcloud cache so the
  // choice survives restarts.
  const handleToggleStar = (titleItem: any) => {
    const starId = titleItem?.XCloudTitleId || titleItem?.titleId;
    if (!starId) {
      return;
    }
    const adding = !isTitleStarred(titleItem);
    const newStarTitles = adding
      ? [...withoutTitle(starTitles, titleItem), starId]
      : withoutTitle(starTitles, titleItem);
    // Favorite and ignore are mutually exclusive.
    const newIgnoreTitles = adding
      ? withoutTitle(ignoreTitles, titleItem)
      : ignoreTitles;

    dispatch({type: 'SET_STARS', payload: newStarTitles});
    dispatch({type: 'SET_IGNORES', payload: newIgnoreTitles});
    persistLists(newStarTitles, newIgnoreTitles);
  };

  // Toggle the ignore state. Ignored titles are hidden from the normal list
  // views by default and can be reviewed under the "Ignored" view.
  const handleToggleIgnore = (titleItem: any) => {
    const ignoreId = titleItem?.XCloudTitleId || titleItem?.titleId;
    if (!ignoreId) {
      return;
    }
    const adding = !isTitleIgnored(titleItem);
    const newIgnoreTitles = adding
      ? [...withoutTitle(ignoreTitles, titleItem), ignoreId]
      : withoutTitle(ignoreTitles, titleItem);
    const newStarTitles = adding
      ? withoutTitle(starTitles, titleItem)
      : starTitles;

    dispatch({type: 'SET_IGNORES', payload: newIgnoreTitles});
    dispatch({type: 'SET_STARS', payload: newStarTitles});
    persistLists(newStarTitles, newIgnoreTitles);
  };

  // Long-press on a list card opens a small action sheet (favorite + store).
  const handleOpenActions = (titleItem: any) => {
    setActionTitle(titleItem);
  };

  const closeActions = () => setActionTitle(null);

  const handleActionToggleStar = () => {
    if (actionTitle) {
      handleToggleStar(actionTitle);
    }
    closeActions();
  };

  const handleActionToggleIgnore = () => {
    if (actionTitle) {
      handleToggleIgnore(actionTitle);
    }
    closeActions();
  };

  const handleActionOpenStore = () => {
    const storeId = actionTitle && getTitleProductId(actionTitle);
    closeActions();
    if (storeId) {
      Linking.openURL(getStoreUrl(storeId)).catch(() => {});
    }
  };

  // Fetch Store prices for the loaded titles, batched and cached in a
  // dedicated store (so it doesn't reset the catalog cache age). The request
  // is keyed by a signature of market + title set, so a market/region change or
  // the catalog growing (cache -> network refresh) refetches, while a stable
  // set is fetched only once. Results are applied only if the claim is still
  // current at resolve time, so a superseded fetch can't overwrite newer prices
  // and the common cache->network double render (identical sig) isn't orphaned.
  React.useEffect(() => {
    if (!titles || titles.length === 0) {
      return;
    }

    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    const storeIds = titles.map((item: any) => item.productId).filter(Boolean);
    // Signature over the whole (stably ordered) id set so any change — not just
    // count/endpoints — invalidates it. Cheap 32-bit rolling hash.
    const idsKey = storeIds.join('|');
    let hash = 0;
    for (let i = 0; i < idsKey.length; i++) {
      // eslint-disable-next-line no-bitwise
      hash = (Math.imul(hash, 31) + idsKey.charCodeAt(i)) | 0;
    }
    const sig = `${market}:${storeIds.length}:${hash}`;

    // Same market + same title set as the in-flight/last request — nothing to
    // do. Also de-dupes the cache->network double render for an unchanged set.
    if (priceSigRef.current === sig) {
      return;
    }
    priceSigRef.current = sig;

    // Reuse the cache when it covers exactly this market + title set. Always
    // show the cached prices immediately; only skip the network fetch when the
    // cache also carries ratings (pre-rating caches fall through to fetch them).
    const cache = getFreshPriceCache(market);
    if (cache && cache.sig === sig) {
      setPriceMap(cache.priceMap);
      if (cache.ratingMap) {
        setRatingMap(cache.ratingMap);
        return;
      }
    }

    // Drop a previous market's ratings while the new ones load, so the rating
    // sort never orders the new market's titles by the old market's ratings.
    setRatingMap({});

    // fetchPricesWithRetry handles the bounded backoff internally.
    fetchPricesWithRetry(storeIds, market, language).then(
      ({prices, ratings, ok}) => {
        // Drop the result if a newer request superseded this one, or unmounted.
        if (priceSigRef.current !== sig || !isMountedRef.current) {
          return;
        }
        if (ok) {
          savePriceCache(prices, ratings, market, sig);
          setPriceMap(prices);
          setRatingMap(ratings);
        } else {
          // Retries exhausted — merge in whatever arrived (don't drop already
          // shown data), don't cache the partial, and free the claim so a
          // later market/title-set change refetches.
          if (Object.keys(prices).length > 0) {
            setPriceMap(prev => ({...prev, ...prices}));
          }
          if (Object.keys(ratings).length > 0) {
            setRatingMap(prev => ({...prev, ...ratings}));
          }
          priceSigRef.current = '';
        }
      },
    );
  }, [titles, gameLanguage, deviceRegion]);

  // Rows only render the favorite heart and the price, so only those inputs
  // force a row re-render; sort/rating/popular changes reorder the data array
  // (showTitles) instead, which FlatList already reacts to.
  const listExtraData = React.useMemo(
    () => ({starTitles, priceMap, leavingSoonSet}),
    [starTitles, priceMap, leavingSoonSet],
  );

  // Load the "Most popular on cloud" order (same list as the web popular
  // gallery) once per market, cached, for the popularity sort. Applies the
  // result only if the market is still current at resolve time (rather than a
  // cleanup cancel), so a same-market re-render doesn't orphan the fetch.
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

    // Drop a previous market's ranks while the new market loads, so the old
    // order is never applied to the new market's titles.
    setPopularRank({});
    fetchPopularOrder(market, language).then(order => {
      // Superseded by a newer market, or unmounted — drop the result.
      if (popularMarketRef.current !== market || !isMountedRef.current) {
        return;
      }
      if (order === null) {
        // Every attempt failed — free the claim so a later change can retry.
        popularMarketRef.current = '';
        return;
      }
      // Success (order may be a legitimately empty list). Cache it either way
      // so an empty market isn't refetched on every change.
      savePopularOrder(order, market);
      setPopularRank(buildPopularRank(order));
    });
  }, [gameLanguage, deviceRegion]);

  // Load the "Leaving soon" set (titles about to leave Game Pass) once per
  // market, cached, to badge list cards. Same no-auth sigls source and
  // resolve-time market guard as the popularity effect above.
  React.useEffect(() => {
    const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
    if (leavingMarketRef.current === market) {
      return;
    }
    leavingMarketRef.current = market;

    const cached = getFreshLeavingSoon(market);
    if (cached) {
      setLeavingSoonSet(buildLeavingSoonSet(cached));
      return;
    }

    // Drop a previous market's set while the new market loads.
    setLeavingSoonSet(new Set());
    fetchLeavingSoon(market, language).then(ids => {
      // Superseded by a newer market, or unmounted — drop the result.
      if (leavingMarketRef.current !== market || !isMountedRef.current) {
        return;
      }
      if (ids === null) {
        // Every attempt failed — free the claim so a later change can retry.
        leavingMarketRef.current = '';
        return;
      }
      // Success (may be a legitimately empty list). Cache it either way so an
      // empty market isn't refetched on every change.
      saveLeavingSoon(ids, market);
      setLeavingSoonSet(buildLeavingSoonSet(ids));
    });
  }, [gameLanguage, deviceRegion]);

  const handleOpenSearch = () => {
    navigation.navigate('Search', {
      keyword,
    });
  };

  const handleClearKeyword = () => {
    setKeyword('');
    navigation.setParams({
      keyword: '',
    });
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({animated: true, offset: 0});
  };

  const loadMoreData = () => {
    if (currentPage < totalPage.current) {
      setLoadmoring(true);
      setCurrentPage(currentPage + 1);
      setTimeout(() => {
        setLoadmoring(false);
      }, 1500);
    } else {
      setLoadmoring(false);
    }
  };

  const footLoading = () => {
    if (loadmoring) {
      return (
        <ActivityIndicator
          size="large"
          color="#0000ff"
          style={styles.loadingIndicator}
        />
      );
    } else {
      return null;
    }
  };

  // Reset paging after a filter change. Only scroll when the change came from
  // the inline bar; while the sheet is open the list is covered, so we defer
  // the scroll until the sheet closes — and only if a filter actually changed.
  const resetAfterFilterChange = () => {
    setCurrentPage(1);
    if (filterSheetOpen) {
      filterChangedInSheetRef.current = true;
    } else {
      scrollToTop();
    }
  };

  const handleTogglePlayable = () => {
    setPlayableOnly(prev => !prev);
    resetAfterFilterChange();
  };

  const handleToggleSale = () => {
    setSaleOnly(prev => !prev);
    resetAfterFilterChange();
  };

  const handleSelectGenre = (genre: string) => {
    setSelectedGenre(prev => (prev === genre ? '' : genre));
    resetAfterFilterChange();
  };

  const handleSelectView = (val: string) => {
    setCurrent(val);
    resetAfterFilterChange();
  };

  const handleSelectSort = (mode: SortMode) => {
    setSortMode(mode);
    resetAfterFilterChange();
  };

  const handleClearFilters = () => {
    // Clear the sort and filters but keep the current View — View is the
    // primary list selection (like a tab), not a refinement to reset.
    setPlayableOnly(false);
    setSaleOnly(false);
    setSelectedGenre('');
    setSortMode('reco');
    resetAfterFilterChange();
  };

  const closeFilterSheet = () => {
    setFilterSheetOpen(false);
    if (filterChangedInSheetRef.current) {
      filterChangedInSheetRef.current = false;
      scrollToTop();
    }
  };

  // A non-default sort only counts as "active" once its data is available,
  // so the badge/pill don't claim a sort the list hasn't actually applied.
  const popularReady =
    sortMode === 'popular' && Object.keys(popularRank).length > 0;
  const ratingReady =
    sortMode === 'rating' && Object.keys(ratingMap).length > 0;
  const sortApplies = popularReady || ratingReady;
  const activeFilterCount =
    (playableOnly ? 1 : 0) +
    (saleOnly ? 1 : 0) +
    (selectedGenre ? 1 : 0) +
    (sortApplies ? 1 : 0);

  const renderTutorial = () => {
    return (
      <Portal>
        <Modal
          visible={showToturial}
          onDismiss={() => {
            setShowToturial(false);
          }}
          contentContainerStyle={{marginLeft: '10%', marginRight: '10%'}}>
          <Card>
            <Card.Content>
              <Text variant="bodyMedium">
                如果你在中国大陆地区，因为云游戏服务器均在海外，云游戏延迟和丢包率高都是正常现象，
                如果你需要使用加速器提升云游戏质量，请按照以下操作顺序加速云游戏。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 10}}>
                1. 打开XStreaming，设置 - 云游戏 -
                地区选择日本或韩国，哪个地区地理位置离你近就选哪个，选择后记得保存，此时XStreaming会重启一次。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 10}}>
                2.
                重启后进入云游戏栏目，选择你需要玩的游戏，开始，等待连接，待连接成功显示游戏画面后，
                将XStreaming切到后台（注意不是直接杀掉APP进程）。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 10}}>
                3. 打开加速器，选择加速『XStreaming』，点击加速，等待加速成功。
              </Text>
              <Text variant="bodyMedium" style={{marginTop: 10}}>
                4.
                返回XStreaming，此时你就会发现延迟和丢包都下来了（此时你会看到丢帧比较多，不用紧张，这是因为先进了游戏，未加速时的丢帧比较多，该数值是累计的，等加速稳定后这个数据会降下去），
                云游戏加速成功。
              </Text>

              <Text variant="bodyMedium" style={{marginTop: 10}}>
                以上指引仅供参考，具体效果以实际为准，如加速器无法加速，请反馈至对应的加速器应用商，请勿反馈至XStreaming。
              </Text>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderActionSheet = () => {
    if (!actionTitle) {
      return null;
    }
    const starred = isTitleStarred(actionTitle);
    const ignored = isTitleIgnored(actionTitle);
    const canStore = !!getTitleProductId(actionTitle);
    return (
      <Portal>
        <Modal
          visible={!!actionTitle}
          onDismiss={closeActions}
          contentContainerStyle={styles.actionSheet}>
          <Card>
            <Card.Content>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                style={styles.actionSheetTitle}>
                {actionTitle.ProductTitle}
              </Text>
              <Pressable
                onPress={handleActionToggleStar}
                android_ripple={{color: 'rgba(150,150,150,0.2)'}}
                style={styles.actionRow}>
                <Icon
                  source={starred ? 'cards-heart' : 'cards-heart-outline'}
                  size={22}
                />
                <Text style={styles.actionLabel}>
                  {starred ? t('Remove from favorites') : t('Add to favorites')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleActionToggleIgnore}
                android_ripple={{color: 'rgba(150,150,150,0.2)'}}
                style={styles.actionRow}>
                <Icon source={ignored ? 'eye' : 'eye-off-outline'} size={22} />
                <Text style={styles.actionLabel}>
                  {ignored ? t('Unignore') : t('Ignore')}
                </Text>
              </Pressable>
              {canStore && (
                <Pressable
                  onPress={handleActionOpenStore}
                  android_ripple={{color: 'rgba(150,150,150,0.2)'}}
                  style={styles.actionRow}>
                  <Icon source="open-in-new" size={22} />
                  <Text style={styles.actionLabel}>{t('View in store')}</Text>
                </Pressable>
              )}
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  // Genre facets derived from the loaded catalog (LocalizedCategories are
  // already localized by the catalog API via the language param).
  const genres = React.useMemo(() => {
    const set = new Set<string>();
    (titles || []).forEach((item: any) => {
      const cats = item?.LocalizedCategories || item?.Categories;
      if (Array.isArray(cats)) {
        cats.forEach((c: any) => {
          if (typeof c === 'string' && c.trim()) {
            set.add(c.trim());
          }
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [titles]);

  // Only depend on data when the active view/control actually consumes it, so
  // an async arrival into an unused source doesn't recompute the list.
  const viewKey = `${current}`;
  const recentForView = viewKey === '0' ? recentTitles : EMPTY_LIST;
  const newForView = viewKey === '2' ? newTitles : EMPTY_LIST;
  const priceMapForFilter = saleOnly ? priceMap : EMPTY_PRICE_MAP;
  const popularRankForSort = popularReady ? popularRank : EMPTY_RANK;
  const ratingMapForSort = ratingReady ? ratingMap : EMPTY_RATING_MAP;

  // The filtered + sorted list. Memoized so unrelated re-renders (opening the
  // sheet, a favorite toggle, etc.) don't re-run the whole pipeline; pagination
  // (currentPage/pageSize) is applied afterwards and deliberately excluded.
  const filteredTitles = React.useMemo(() => {
    // View (0 recent / 1 star / 2 newest / 3 all).
    let list: any[];
    switch (viewKey) {
      case '0':
        list = recentForView;
        break;
      case '1':
        list = (titles as any[]).filter(
          (item: any) =>
            starTitles.includes(item.XCloudTitleId) ||
            starTitles.includes(item.titleId),
        );
        break;
      case '2':
        list = newForView;
        break;
      case '3':
        list = titles;
        break;
      case '4':
        // Ignored view: only ignored titles.
        list = (titles as any[]).filter(
          (item: any) =>
            ignoreTitles.includes(item.XCloudTitleId) ||
            ignoreTitles.includes(item.titleId),
        );
        break;
      default:
        list = [];
        break;
    }

    // Ignored titles are hidden from every other view by default.
    if (viewKey !== '4' && ignoreTitles.length > 0) {
      list = list.filter(
        (item: any) =>
          !ignoreTitles.includes(item.XCloudTitleId) &&
          !ignoreTitles.includes(item.titleId),
      );
    }

    // "Playable" is a filter now: keep only entitled titles.
    if (playableOnly) {
      list = list.filter(
        (item: any) => item.details && item.details.hasEntitlement === true,
      );
    }
    if (saleOnly) {
      // Match the card's sale threshold (shared isSaleForDisplay rule).
      list = list.filter((item: any) =>
        isSaleForDisplay(getPrice(priceMapForFilter, item.productId)),
      );
    }
    if (selectedGenre) {
      list = list.filter((item: any) => {
        const cats = item?.LocalizedCategories || item?.Categories;
        // Compare trimmed — the genre chips are built from c.trim().
        return (
          Array.isArray(cats) &&
          cats.some(
            (c: any) => typeof c === 'string' && c.trim() === selectedGenre,
          )
        );
      });
    }
    if (keyword.length > 0) {
      const upper = keyword.toUpperCase();
      list = list.filter(
        (title: any) =>
          (title.ProductTitle || '').toUpperCase().indexOf(upper) > -1,
      );
    }

    // Sort. Decorate each item with its key once (not per comparison), sort a
    // copy, then undecorate — never mutating the shared source array.
    if (popularReady) {
      const keyOf = (item: any) => {
        const r = popularRankForSort[(item.productId || '').toUpperCase()];
        return r === undefined ? Number.MAX_SAFE_INTEGER : r;
      };
      list = list
        .map((item: any) => ({item, key: keyOf(item)}))
        .sort((a, b) => a.key - b.key)
        .map(d => d.item);
    } else if (ratingReady) {
      // Weight the average by sample size (Bayesian shrink to a neutral prior)
      // so a single 5-star review doesn't outrank a highly-rated popular game.
      const scoreOf = (item: any) => {
        const r = ratingMapForSort[(item.productId || '').toUpperCase()];
        if (!r) {
          return -1;
        }
        return (
          (r.average * r.count + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) /
          (r.count + RATING_PRIOR_WEIGHT)
        );
      };
      list = list
        .map((item: any) => ({item, key: scoreOf(item)}))
        .sort((a, b) => b.key - a.key)
        .map(d => d.item);
    }

    return list;
  }, [
    viewKey,
    recentForView,
    newForView,
    titles,
    starTitles,
    ignoreTitles,
    playableOnly,
    saleOnly,
    selectedGenre,
    keyword,
    priceMapForFilter,
    popularReady,
    ratingReady,
    popularRankForSort,
    ratingMapForSort,
  ]);

  // Always recompute (0 when a filter empties the list) so a stale page count
  // can't keep the load-more footer spinning under an empty result.
  totalPage.current = Math.ceil(filteredTitles.length / pageSize);

  const endIdx = currentPage * pageSize;
  let showTitles = filteredTitles.slice(0, endIdx);

  // Views (formerly the top tab strip) now live in the controls sheet.
  const viewOptions = [
    {value: '0', label: t('Recently')},
    {value: '1', label: t('Stars')},
    {value: '2', label: t('Newest')},
    {value: '3', label: t('All')},
    {value: '4', label: t('Ignored')},
  ];
  const currentViewLabel =
    viewOptions.find(v => v.value === `${current}`)?.label || t('All');
  const sortOptions: {value: SortMode; label: string}[] = [
    {value: 'reco', label: t('Recommended')},
    {value: 'popular', label: t('Popular')},
    {value: 'rating', label: t('Rating')},
  ];
  const activeSortLabel =
    sortMode !== 'reco'
      ? sortOptions.find(s => s.value === sortMode)?.label || ''
      : '';

  const renderGenreChip = (
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      key={key}
      focusable={!disabled}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      android_ripple={{color: 'rgba(16, 124, 16, 0.16)'}}
      style={[
        styles.filterChip,
        styles.genreGridChip,
        active && styles.filterChipSelected,
        disabled && styles.filterChipDisabled,
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.filterChipText,
          active && styles.filterChipTextSelected,
        ]}>
        {label}
      </Text>
    </Pressable>
  );

  const renderActivePill = (
    key: string,
    label: string,
    danger: boolean,
    onRemove: () => void,
  ) => (
    <View
      key={key}
      style={[
        styles.activePill,
        danger ? styles.activePillRed : styles.activePillGreen,
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.activePillText,
          danger ? styles.activePillTextRed : styles.activePillTextGreen,
        ]}>
        {label}
      </Text>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        android_ripple={{color: 'rgba(150,150,150,0.25)', borderless: true}}
        style={styles.activePillClose}>
        <Text
          style={[
            styles.activePillCloseText,
            danger ? styles.activePillTextRed : styles.activePillTextGreen,
          ]}>
          ✕
        </Text>
      </Pressable>
    </View>
  );

  // Control bar: the current view + a single "Filters" entry point, then the
  // applied sort/filters as removable pills. Everything opens the same sheet.
  const renderFilterBar = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}>
        <Pressable
          focusable={true}
          onPress={() => setFilterSheetOpen(true)}
          android_ripple={{color: 'rgba(255,255,255,0.18)'}}
          style={styles.viewButton}>
          <Text style={styles.viewButtonText}>{currentViewLabel}</Text>
          <Icon source="chevron-down" size={16} color="#FFFFFF" />
        </Pressable>

        <Pressable
          focusable={true}
          onPress={() => setFilterSheetOpen(true)}
          android_ripple={{color: 'rgba(150,150,150,0.2)'}}
          style={styles.filterButton}>
          <Icon source="tune-variant" size={16} />
          <Text style={styles.filterButtonText}>{t('Filters')}</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>

        {sortApplies &&
          renderActivePill('__sort', activeSortLabel, false, () =>
            handleSelectSort('reco'),
          )}
        {playableOnly &&
          renderActivePill('__p', t('Playable'), false, handleTogglePlayable)}
        {saleOnly &&
          renderActivePill('__s', t('On sale'), true, handleToggleSale)}
        {selectedGenre !== '' &&
          renderActivePill('__g', selectedGenre, false, () =>
            handleSelectGenre(selectedGenre),
          )}
      </ScrollView>
    );
  };

  const renderFilterSheet = () => {
    return (
      <Portal>
        <Modal
          visible={filterSheetOpen}
          onDismiss={closeFilterSheet}
          contentContainerStyle={styles.filterSheet}>
          <Card>
            <ScrollView style={styles.filterSheetScroll}>
              <Card.Content>
                <Text style={styles.sheetHeader}>{t('View')}</Text>
                <View style={styles.genreGrid}>
                  {viewOptions.map(v =>
                    renderGenreChip(
                      `view_${v.value}`,
                      v.label,
                      `${current}` === v.value,
                      () => handleSelectView(v.value),
                    ),
                  )}
                </View>

                <Text style={styles.sheetHeader}>{t('Sort')}</Text>
                <View style={styles.genreGrid}>
                  {sortOptions.map(s => {
                    // Popular/Rating stay disabled until their data is loaded,
                    // so the user can't pick a sort that wouldn't take effect.
                    const disabled =
                      (s.value === 'popular' &&
                        Object.keys(popularRank).length === 0) ||
                      (s.value === 'rating' &&
                        Object.keys(ratingMap).length === 0);
                    return renderGenreChip(
                      `sort_${s.value}`,
                      s.label,
                      sortMode === s.value,
                      () => handleSelectSort(s.value),
                      disabled,
                    );
                  })}
                </View>

                <Text style={styles.sheetHeader}>{t('Refine')}</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{t('Playable')}</Text>
                  <Switch
                    value={playableOnly}
                    onValueChange={handleTogglePlayable}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{t('On sale')}</Text>
                  <Switch value={saleOnly} onValueChange={handleToggleSale} />
                </View>

                <Text style={styles.sheetHeader}>{t('Genre')}</Text>
                <View style={styles.genreGrid}>
                  {renderGenreChip(
                    '__all',
                    t('All'),
                    selectedGenre === '',
                    () => handleSelectGenre(''),
                  )}
                  {genres.map(genre =>
                    renderGenreChip(genre, genre, selectedGenre === genre, () =>
                      handleSelectGenre(genre),
                    ),
                  )}
                </View>

                <View style={styles.sheetActions}>
                  <Button mode="text" onPress={handleClearFilters}>
                    {t('Clear')}
                  </Button>
                  <Button mode="contained" onPress={closeFilterSheet}>
                    {t('Done')}
                  </Button>
                </View>
              </Card.Content>
            </ScrollView>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderMobileSearchButton = () => {
    if (isLargeScreen) {
      return null;
    }

    const hasKeyword = keyword.length > 0;
    const searchLabel = hasKeyword ? `${t('Search')}: ${keyword}` : t('Search');

    if (hasKeyword) {
      return (
        <View
          style={[styles.mobileSearchButton, styles.mobileSearchButtonActive]}>
          <Pressable
            focusable={true}
            onPress={handleOpenSearch}
            android_ripple={{color: 'rgba(255, 255, 255, 0.16)'}}
            style={({focused, pressed}) => [
              styles.mobileSearchMain,
              focused && styles.mobileSearchSegmentFocused,
              pressed && styles.mobileSearchButtonPressed,
            ]}>
            <Icon source="magnify" size={18} color="#FFFFFF" />
            <Text
              numberOfLines={1}
              style={[styles.mobileSearchText, styles.mobileSearchTextActive]}>
              {searchLabel}
            </Text>
          </Pressable>
          <Pressable
            focusable={true}
            onPress={handleClearKeyword}
            android_ripple={{color: 'rgba(255, 255, 255, 0.18)'}}
            style={({focused, pressed}) => [
              styles.mobileSearchClear,
              focused && styles.mobileSearchSegmentFocused,
              pressed && styles.mobileSearchButtonPressed,
            ]}>
            <Icon source="close" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        focusable={true}
        onPress={handleOpenSearch}
        android_ripple={{color: 'rgba(16, 124, 16, 0.12)'}}
        style={({focused, pressed}) => [
          styles.mobileSearchButton,
          hasKeyword && styles.mobileSearchButtonActive,
          focused && styles.mobileSearchButtonFocused,
          pressed && styles.mobileSearchButtonPressed,
        ]}>
        <Icon source="magnify" size={18} color="#107C10" />
        <Text numberOfLines={1} style={styles.mobileSearchText}>
          {searchLabel}
        </Text>
      </Pressable>
    );
  };

  const renderLargeKeywordPill = () => {
    if (!keyword || !isLargeScreen) {
      return null;
    }

    return (
      <View style={styles.search}>
        <View style={styles.keywordPill}>
          <Pressable
            focusable={true}
            onPress={handleOpenSearch}
            android_ripple={{color: 'rgba(16, 124, 16, 0.12)'}}
            style={({focused, pressed}) => [
              styles.keywordPillMain,
              focused && styles.keywordPillFocused,
              pressed && styles.keywordPillPressed,
            ]}>
            <Icon source="cloud-search-outline" size={18} color="#107C10" />
            <Text numberOfLines={1} style={styles.keywordPillText}>
              {keyword}
            </Text>
          </Pressable>
          <Pressable
            focusable={true}
            onPress={handleClearKeyword}
            android_ripple={{color: 'rgba(16, 124, 16, 0.14)'}}
            style={({focused, pressed}) => [
              styles.keywordPillClear,
              focused && styles.keywordPillFocused,
              pressed && styles.keywordPillPressed,
            ]}>
            <Icon source="close" size={18} color="#107C10" />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <>
      <Spinner loading={loading} text={t('Loading...')} />

      {!isLimited && (
        <>
          <View style={styles.gameContainer}>
            <View
              style={[styles.toolbar, isLargeScreen && styles.toolbarLarge]}>
              <View
                style={[
                  styles.segmentedWrap,
                  isLargeScreen && styles.segmentedWrapLarge,
                ]}>
                {renderFilterBar()}
              </View>
              <IconButton
                icon="magnify"
                size={isLargeScreen ? 22 : 24}
                style={[
                  styles.searchButton,
                  isLargeScreen && styles.searchButtonLarge,
                  !isLargeScreen && styles.searchButtonHidden,
                ]}
                onPress={handleOpenSearch}
              />
            </View>

            {renderMobileSearchButton()}

            {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
              <Text
                variant="labelMedium"
                style={styles.tutorialText}
                onPress={() => {
                  setShowToturial(true);
                }}>
                🚀点击查看云游戏加速指引
              </Text>
            )}

            {renderLargeKeywordPill()}

            {!loading && !showTitles.length && <Empty />}

            {showTitles.length > 0 && (
              <>
                <FlatList
                  ref={flatListRef}
                  data={showTitles}
                  numColumns={numColumns}
                  key={numColumns}
                  extraData={listExtraData}
                  contentContainerStyle={[
                    styles.listContainer,
                    isLargeScreen && styles.listContainerLarge,
                  ]}
                  renderItem={({item}) => {
                    return (
                      <View
                        style={[
                          styles.listItem,
                          {width: `${100 / numColumns}%`},
                        ]}>
                        <TitleItem
                          titleItem={item}
                          onPress={handleViewDetail}
                          onLongPress={handleOpenActions}
                          isFavorite={isTitleStarred(item)}
                          isLeavingSoon={leavingSoonSet.has(
                            String(item.productId || '').toUpperCase(),
                          )}
                          price={getPrice(priceMap, item.productId)}
                          compact={isLargeScreen}
                        />
                      </View>
                    );
                  }}
                  onEndReached={loadMoreData}
                  onEndReachedThreshold={0.1}
                  ListFooterComponent={footLoading}
                />
              </>
            )}
          </View>
        </>
      )}

      {renderTutorial()}

      {renderActionSheet()}

      {renderFilterSheet()}

      {isLimited && (
        <View style={styles.container}>
          <View>
            <Text style={styles.tips} variant="bodyLarge">
              {t('NoXGP')}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionSheet: {
    marginHorizontal: '8%',
  },
  actionSheetTitle: {
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionLabel: {
    fontSize: 15,
  },
  tips: {
    textAlign: 'center',
    lineHeight: 30,
  },
  gameContainer: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toolbarLarge: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 10,
  },
  segmentedWrap: {
    flex: 1,
  },
  segmentedWrapLarge: {
    maxWidth: 620,
    flex: 0,
    width: 620,
  },
  filterBar: {
    flexGrow: 0,
    marginTop: 6,
    marginBottom: 4,
  },
  filterBarContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  filterChip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 16, 0.35)',
    marginRight: 6,
  },
  filterChipSelected: {
    backgroundColor: '#107C10',
    borderColor: '#107C10',
  },
  filterChipDisabled: {
    opacity: 0.4,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8fb98f',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#107C10',
    marginRight: 8,
    gap: 5,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(140, 140, 150, 0.4)',
    marginRight: 8,
    gap: 6,
  },
  filterButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#107C10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingLeft: 11,
    paddingRight: 5,
    borderRadius: 15,
    borderWidth: 1,
    marginRight: 6,
    gap: 6,
  },
  activePillGreen: {
    backgroundColor: 'rgba(16, 124, 16, 0.12)',
    borderColor: 'rgba(16, 124, 16, 0.30)',
  },
  activePillRed: {
    backgroundColor: 'rgba(229, 52, 43, 0.12)',
    borderColor: 'rgba(229, 52, 43, 0.30)',
  },
  activePillText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 120,
  },
  activePillTextGreen: {
    color: '#3aa33a',
  },
  activePillTextRed: {
    color: '#e5342b',
  },
  activePillClose: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePillCloseText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterSheet: {
    marginHorizontal: '6%',
  },
  filterSheetScroll: {
    maxHeight: 480,
  },
  sheetHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#9096a8',
    marginTop: 12,
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchLabel: {
    fontSize: 15,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  genreGridChip: {
    marginRight: 0,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  searchButton: {
    position: 'absolute',
    right: 8,
    top: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchButtonLarge: {
    width: 42,
    height: 42,
    right: 24,
    top: 13,
  },
  searchButtonHidden: {
    display: 'none',
  },
  mobileSearchButton: {
    height: 38,
    marginHorizontal: 8,
    marginTop: 2,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 16, 0.38)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  mobileSearchButtonActive: {
    borderColor: 'rgba(16, 124, 16, 0.72)',
    backgroundColor: '#107C10',
  },
  mobileSearchMain: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  mobileSearchClear: {
    width: 42,
    height: 32,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileSearchSegmentFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  mobileSearchButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  mobileSearchButtonPressed: {
    opacity: 0.78,
  },
  mobileSearchText: {
    marginLeft: 6,
    color: '#107C10',
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  mobileSearchTextActive: {
    color: '#FFFFFF',
  },
  categoryWrap: {
    width: 200,
    padding: 10,
  },
  listContainer: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  listContainerLarge: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  listItem: {
    justifyContent: 'center',
  },
  loadingIndicator: {
    padding: 20,
  },
  search: {
    paddingLeft: 10,
    paddingRight: 10,
  },
  keywordPill: {
    height: 38,
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 16, 0.42)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  keywordPillMain: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 10,
  },
  keywordPillText: {
    marginLeft: 6,
    color: '#107C10',
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  keywordPillClear: {
    width: 42,
    height: '100%',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(16, 124, 16, 0.24)',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keywordPillFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(16, 124, 16, 0.14)',
  },
  keywordPillPressed: {
    opacity: 0.78,
  },
  tutorialText: {
    textAlign: 'center',
    paddingTop: 5,
    paddingBottom: 10,
  },
});

export default CloudScreen;
