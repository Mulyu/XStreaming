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
import {Text, Portal, Modal, Card, IconButton, Icon} from 'react-native-paper';
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
  fetchPrices,
  deriveMarketLanguage,
  getStoreUrl,
  getPrice,
} from '../utils/storePrice';
import {
  getFreshPriceCache,
  savePriceCache,
  PRICE_TTL_MS,
} from '../store/priceStore';
import {getSystemRegion} from '../utils/locale';
import {getTitleProductId} from '../store/shortcutStore';

const log = debugFactory('CloudScreen');

function CloudScreen({navigation, route}) {
  const {t, i18n} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const starTitles = useSelector((state: any) => state.stars || []);

  const currentLanguage = i18n.language;
  // Read here (not just inside the price effect) so a change re-runs the effect.
  const gameLanguage = getSettings().preferred_game_language;

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
  const [selectedGenre, setSelectedGenre] = React.useState('');
  const flatListRef = React.useRef<any>(null);
  const isFetchGame = React.useRef(false);
  const [priceMap, setPriceMap] = React.useState<Record<string, PriceInfo>>({});
  const [actionTitle, setActionTitle] = React.useState<any>(null);
  // Signature (market + title set) we have already fetched or are fetching
  // prices for. Cleared on failure so a later reload can retry.
  const priceSigRef = React.useRef<string>('');

  const currentTitles = React.useRef([]);
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

  // Toggle the favorite (star) state. Stars are keyed by XCloudTitleId to
  // match the detail-screen toggle, and persisted to the xcloud cache so the
  // choice survives restarts.
  const handleToggleStar = (titleItem: any) => {
    const starId = titleItem?.XCloudTitleId || titleItem?.titleId;
    if (!starId) {
      return;
    }
    const newStarTitles = isTitleStarred(titleItem)
      ? starTitles.filter(
          (id: any) =>
            id !== titleItem.XCloudTitleId && id !== titleItem.titleId,
        )
      : [...starTitles, starId];

    dispatch({
      type: 'SET_STARS',
      payload: newStarTitles,
    });

    const cacheData = getXcloudData();
    if (cacheData) {
      cacheData.starTitles = newStarTitles;
      saveXcloudData(cacheData);
    }
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

  const handleActionOpenStore = () => {
    const storeId = actionTitle && getTitleProductId(actionTitle);
    closeActions();
    if (storeId) {
      Linking.openURL(getStoreUrl(storeId)).catch(() => {});
    }
  };

  // Fetch Store prices for the loaded titles, batched and cached in a
  // dedicated store (so it doesn't reset the catalog cache age). The request
  // is keyed by a signature of market + title set, so a language/region change
  // or the catalog growing (cache -> network refresh) refetches, while a stable
  // set is fetched only once. The cancel flag drops a superseded in-flight
  // result so it can't overwrite newer prices.
  React.useEffect(() => {
    if (!titles || titles.length === 0) {
      return;
    }

    const {market, language} = deriveMarketLanguage(
      gameLanguage,
      getSystemRegion(),
    );
    const storeIds = titles.map((item: any) => item.productId).filter(Boolean);
    // Signature over the whole (stably ordered) id set so any change — not just
    // count/endpoints — invalidates it. Cheap 32-bit rolling hash.
    const idsKey = storeIds.join('|');
    let hash = 0;
    for (let i = 0; i < idsKey.length; i++) {
      // eslint-disable-next-line no-bitwise
      hash = (Math.imul(hash, 31) + idsKey.charCodeAt(i)) | 0;
    }
    // Include a TTL bucket so an app left mounted past the cache window
    // refetches (the bucket flips) instead of showing stale prices forever.
    const ttlBucket = Math.floor(Date.now() / PRICE_TTL_MS);
    const sig = `${market}:${storeIds.length}:${hash}:${ttlBucket}`;

    // Same market + same title set as the in-flight/last request — nothing to
    // do. Also de-dupes the cache->network double render for an unchanged set.
    if (priceSigRef.current === sig) {
      return;
    }
    priceSigRef.current = sig;

    // Reuse the cache only when it covers exactly this market + title set.
    const cache = getFreshPriceCache(market);
    if (cache && cache.sig === sig) {
      setPriceMap(cache.priceMap);
      return;
    }

    let cancelled = false;
    fetchPrices(storeIds, market, language)
      .then(({prices, ok}) => {
        if (cancelled) {
          return;
        }
        if (!ok) {
          // A batch failed — merge in whatever arrived (so already-shown prices
          // aren't dropped) but don't cache the partial result, and free the
          // claim so a later reload retries the rest.
          if (Object.keys(prices).length > 0) {
            setPriceMap(prev => ({...prev, ...prices}));
          }
          if (priceSigRef.current === sig) {
            priceSigRef.current = '';
          }
          return;
        }
        savePriceCache(prices, market, sig);
        setPriceMap(prices);
      })
      .catch(() => {
        if (!cancelled && priceSigRef.current === sig) {
          priceSigRef.current = '';
        }
      });

    return () => {
      cancelled = true;
    };
  }, [titles, gameLanguage]);

  // Rows re-render when favorites or fetched prices change.
  const listExtraData = React.useMemo(
    () => ({starTitles, priceMap}),
    [starTitles, priceMap],
  );

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
    if (currentPage <= totalPage.current) {
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

  const handleSelectCategories = val => {
    setCurrent(val);
    setLoading(true);
    setCurrentPage(1);
    scrollToTop();
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  const handleTogglePlayable = () => {
    setPlayableOnly(prev => !prev);
    setCurrentPage(1);
    scrollToTop();
  };

  const handleSelectGenre = (genre: string) => {
    setSelectedGenre(prev => (prev === genre ? '' : genre));
    setCurrentPage(1);
    scrollToTop();
  };

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

  /**
   * 0 - recent
   * 1 - star
   * 2 - newest
   * 3 - all
   */
  switch (`${current}`) {
    case '0':
      currentTitles.current = recentTitles;
      break;
    case '1':
      const _starTitles: any = [];
      titles.forEach(item => {
        // Get star games
        if (
          starTitles.includes(item.XCloudTitleId) ||
          starTitles.includes(item.titleId)
        ) {
          _starTitles.push(item);
        }
      });
      currentTitles.current = _starTitles;
      break;
    case '2':
      currentTitles.current = newTitles;
      break;
    case '3':
      currentTitles.current = titles;
      break;
    default:
      currentTitles.current = [];
      break;
  }

  // "Playable" moved from a tab to a filter: keep only titles the user is
  // entitled to (positive signal, avoids permission errors on launch).
  if (playableOnly) {
    currentTitles.current = currentTitles.current.filter(
      (item: any) => item.details && item.details.hasEntitlement === true,
    );
  }

  if (selectedGenre) {
    currentTitles.current = currentTitles.current.filter((item: any) => {
      const cats = item?.LocalizedCategories || item?.Categories;
      return Array.isArray(cats) && cats.includes(selectedGenre);
    });
  }

  if (keyword.length > 0) {
    currentTitles.current = currentTitles.current.filter((title: any) => {
      return (
        title.ProductTitle.toUpperCase().indexOf(keyword.toUpperCase()) > -1
      );
    });
  }

  if (currentTitles.current.length > 0) {
    totalPage.current = Math.ceil(currentTitles.current.length / pageSize);
  }

  const endIdx = currentPage * pageSize;
  let showTitles = currentTitles.current.slice(0, endIdx);
  const segmentedButtons = [
    {
      value: '0',
      label: t('Recently'),
    },
    {
      value: '1',
      label: t('Stars'),
    },
    {
      value: '2',
      label: t('Newest'),
    },
    {
      value: '3',
      label: t('All'),
    },
  ];

  const renderCategoryTabs = () => {
    const tabNodes = segmentedButtons.map(item => {
      const selected = `${current}` === item.value;
      return (
        <Pressable
          key={item.value}
          focusable={true}
          onPress={() => handleSelectCategories(item.value)}
          android_ripple={{color: 'rgba(16, 124, 16, 0.16)'}}
          style={({focused, pressed}) => [
            styles.tab,
            isLargeScreen ? styles.tabLarge : styles.tabMobileScroll,
            selected && styles.tabSelected,
            focused && styles.tabFocused,
            pressed && styles.tabPressed,
          ]}>
          <Text
            numberOfLines={1}
            style={[
              styles.tabText,
              isLargeScreen && styles.tabTextLarge,
              selected && styles.tabTextSelected,
            ]}>
            {item.label}
          </Text>
        </Pressable>
      );
    });

    if (isLargeScreen) {
      return <View style={[styles.tabs, styles.tabsLarge]}>{tabNodes}</View>;
    }

    // Mobile: allow the tab strip to scroll horizontally so all tabs stay
    // fully usable on narrow phones instead of being clipped by the row.
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScrollContent}>
        <View style={styles.tabs}>{tabNodes}</View>
      </ScrollView>
    );
  };

  const renderFilterBar = () => {
    const renderChip = (
      key: string,
      label: string,
      active: boolean,
      onPress: () => void,
    ) => (
      <Pressable
        key={key}
        focusable={true}
        onPress={onPress}
        android_ripple={{color: 'rgba(16, 124, 16, 0.16)'}}
        style={[styles.filterChip, active && styles.filterChipSelected]}>
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

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}>
        {renderChip(
          '__playable',
          `${playableOnly ? '✓ ' : ''}${t('Playable')}`,
          playableOnly,
          handleTogglePlayable,
        )}
        <View style={styles.filterDivider} />
        {renderChip('__all', t('All'), selectedGenre === '', () =>
          handleSelectGenre(''),
        )}
        {genres.map(genre =>
          renderChip(genre, genre, selectedGenre === genre, () =>
            handleSelectGenre(genre),
          ),
        )}
      </ScrollView>
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
                {renderCategoryTabs()}
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

            {renderFilterBar()}

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
  tabs: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 16, 0.45)',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tabsLarge: {
    height: 40,
  },
  tab: {
    flex: 1,
    height: '100%',
    minWidth: 64,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(16, 124, 16, 0.24)',
  },
  tabMobileScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  tabsScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  tabLarge: {
    minWidth: 86,
    paddingHorizontal: 12,
  },
  tabSelected: {
    backgroundColor: '#107C10',
  },
  tabFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  tabPressed: {
    opacity: 0.78,
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
    color: '#107C10',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  tabTextLarge: {
    fontSize: 12,
  },
  tabTextSelected: {
    color: '#FFFFFF',
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
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8fb98f',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  filterDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginRight: 6,
    marginLeft: 2,
    alignSelf: 'center',
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
