import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Animated,
  PanResponder,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {useSelector, useDispatch} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {getXcloudData, saveXcloudData} from '../store/xcloudStore';
import {
  getDecidedTitles,
  addDecidedTitle,
  reopenFavoritesAndHolds,
  getDiscoveryId,
} from '../store/discoveryStore';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {deriveMarketLanguage, RatingInfo} from '../utils/storePrice';
import {getFreshPriceCache} from '../store/priceStore';

type Decision = 'favorite' | 'hold' | 'ignore';

const FAV_COLOR = '#2FD24B';
const IGNORE_COLOR = '#E5533C';
const HOLD_COLOR = '#F2B84B';
const SWIPE_THRESHOLD = 110;

// Fisher–Yates shuffle so each Discovery run surfaces games in a fresh order
// instead of always marching through the catalog top-down.
const shuffle = (arr: any[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function DiscoveryScreen() {
  const {t} = useTranslation();
  const dispatch = useDispatch();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const starTitles = useSelector((state: any) => state.stars || []);
  const ignoreTitles = useSelector((state: any) => state.ignores || []);
  // Keep the latest lists in refs so the pan handlers (created once) always
  // persist against current data rather than a stale closure.
  const starsRef = React.useRef(starTitles);
  const ignoresRef = React.useRef(ignoreTitles);
  starsRef.current = starTitles;
  ignoresRef.current = ignoreTitles;

  const [queue, setQueue] = React.useState<any[]>([]);
  const [counts, setCounts] = React.useState({favorite: 0, hold: 0, ignore: 0});

  const position = React.useRef(new Animated.ValueXY()).current;

  const ratingMap = React.useMemo<Record<string, RatingInfo>>(() => {
    const {market} = deriveMarketLanguage(
      getSettings().preferred_game_language,
      getSystemRegion(),
    );
    const cache = getFreshPriceCache(market);
    return cache?.ratingMap || {};
  }, []);

  // Build the queue: every catalog title not yet decided and not ignored.
  const buildQueue = React.useCallback(() => {
    const cacheData = getXcloudData();
    const titles: any[] = (cacheData && cacheData.titles) || [];
    const decided = new Set(getDecidedTitles());
    const ignored = new Set(ignoresRef.current);
    const candidates = titles.filter((item: any) => {
      const id = getDiscoveryId(item);
      if (!id) {
        return false;
      }
      return !decided.has(id) && !ignored.has(id);
    });
    return shuffle(candidates);
  }, []);

  React.useEffect(() => {
    setQueue(buildQueue());
    setCounts({favorite: 0, hold: 0, ignore: 0});
  }, [buildQueue]);

  // Persist star/ignore lists to the xcloud cache (mirrors the Cloud screen so
  // the two stay in sync across restarts).
  const persistLists = (nextStars: string[], nextIgnores: string[]) => {
    const cacheData = getXcloudData();
    if (cacheData) {
      cacheData.starTitles = nextStars;
      cacheData.ignoreTitles = nextIgnores;
      saveXcloudData(cacheData);
    }
  };

  const applyDecision = React.useCallback(
    (item: any, decision: Decision) => {
      const id = getDiscoveryId(item);
      if (!id) {
        return;
      }
      const stars = starsRef.current;
      const ignores = ignoresRef.current;
      const without = (list: string[]) => list.filter((x: string) => x !== id);

      if (decision === 'favorite') {
        // Favorite and ignore are mutually exclusive.
        const nextStars = stars.includes(id) ? stars : [...without(stars), id];
        const nextIgnores = without(ignores);
        dispatch({type: 'SET_STARS', payload: nextStars});
        dispatch({type: 'SET_IGNORES', payload: nextIgnores});
        persistLists(nextStars, nextIgnores);
      } else if (decision === 'ignore') {
        const nextIgnores = ignores.includes(id)
          ? ignores
          : [...without(ignores), id];
        const nextStars = without(stars);
        dispatch({type: 'SET_IGNORES', payload: nextIgnores});
        dispatch({type: 'SET_STARS', payload: nextStars});
        persistLists(nextStars, nextIgnores);
      }
      // 'hold' leaves the star/ignore lists untouched — it only records that
      // the game has been seen so it won't reappear until a reload.

      addDecidedTitle(id);
      setCounts(prev => ({...prev, [decision]: prev[decision] + 1}));
      setQueue(prev => prev.slice(1));
    },
    [dispatch],
  );

  // Fling the top card off-screen in the decision's direction, then commit.
  const commitWithAnimation = React.useCallback(
    (item: any, decision: Decision) => {
      const toValue =
        decision === 'favorite'
          ? {x: screenWidth * 1.4, y: 0}
          : decision === 'ignore'
          ? {x: -screenWidth * 1.4, y: 0}
          : {x: 0, y: screenHeight};
      Animated.timing(position, {
        toValue,
        duration: 220,
        useNativeDriver: false,
      }).start(() => {
        position.setValue({x: 0, y: 0});
        applyDecision(item, decision);
      });
    },
    [applyDecision, position, screenWidth, screenHeight],
  );

  // Latest top card kept in a ref so the (once-created) pan responder always
  // acts on the current card.
  const topCardRef = React.useRef<any>(null);
  topCardRef.current = queue[0] || null;

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderMove: (_e, g) => {
          position.setValue({x: g.dx, y: g.dy});
        },
        onPanResponderRelease: (_e, g) => {
          const item = topCardRef.current;
          if (!item) {
            Animated.spring(position, {
              toValue: {x: 0, y: 0},
              useNativeDriver: false,
            }).start();
            return;
          }
          if (g.dx > SWIPE_THRESHOLD) {
            commitWithAnimation(item, 'favorite');
          } else if (g.dx < -SWIPE_THRESHOLD) {
            commitWithAnimation(item, 'ignore');
          } else if (g.dy > SWIPE_THRESHOLD) {
            commitWithAnimation(item, 'hold');
          } else {
            Animated.spring(position, {
              toValue: {x: 0, y: 0},
              friction: 6,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [commitWithAnimation, position],
  );

  const handleReload = () => {
    reopenFavoritesAndHolds(ignoresRef.current);
    setQueue(buildQueue());
    setCounts({favorite: 0, hold: 0, ignore: 0});
  };

  const cardMaxWidth = Math.min(screenWidth - 32, 420);

  const rotate = position.x.interpolate({
    inputRange: [-screenWidth / 2, 0, screenWidth / 2],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });
  const favOpacity = position.x.interpolate({
    inputRange: [40, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const ignoreOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const holdOpacity = position.y.interpolate({
    inputRange: [40, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const renderPoster = (item: any, small = false) => {
    const img = item?.Image_Poster || item?.Image_Tile;
    const url = img?.URL ? 'https:' + img.URL : null;
    if (!url) {
      return (
        <View style={[styles.poster, styles.posterEmpty]}>
          <Icon source="image-off-outline" size={40} color="#5C6C64" />
        </View>
      );
    }
    return (
      <Image
        source={{uri: url}}
        resizeMode="cover"
        style={[styles.poster, small && styles.posterSmall]}
      />
    );
  };

  const renderGenres = (item: any) => {
    const cats: any[] = item?.LocalizedCategories || item?.Categories || [];
    const list = (Array.isArray(cats) ? cats : [])
      .filter((c: any) => typeof c === 'string' && c.trim())
      .slice(0, 3);
    if (list.length === 0) {
      return null;
    }
    return (
      <View style={styles.genreRow}>
        {list.map((c: string) => (
          <View key={c} style={styles.genreChip}>
            <Text style={styles.genreChipText}>{c.trim()}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderRating = (item: any) => {
    const r = ratingMap[(item?.productId || '').toUpperCase()];
    if (!r || !r.average) {
      return null;
    }
    const full = Math.round(r.average);
    return (
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map(n => (
          <Icon
            key={n}
            source={n <= full ? 'star' : 'star-outline'}
            size={16}
            color={HOLD_COLOR}
          />
        ))}
        <Text style={styles.ratingText}>{r.average.toFixed(1)}</Text>
      </View>
    );
  };

  const renderCardBody = (item: any) => (
    <>
      <View style={styles.posterWrap}>
        {renderPoster(item)}
        <View style={styles.posterScrim} />
        {item?.details?.hasEntitlement === true && (
          <View style={styles.playableBadge}>
            <Text style={styles.playableBadgeText}>✓ {t('Playable')}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item?.ProductTitle}
        </Text>
        {renderRating(item)}
        {renderGenres(item)}
      </View>
    </>
  );

  const renderEmpty = () => {
    const sessionCount = counts.favorite + counts.hold + counts.ignore;
    const decidedAny = sessionCount > 0 || getDecidedTitles().length > 0;
    return (
      <View style={styles.emptyWrap}>
        <Icon source="cards-outline" size={56} color={FAV_COLOR} />
        <Text style={styles.emptyTitle}>
          {decidedAny ? t('DiscoveryDone') : t('DiscoveryEmpty')}
        </Text>
        {sessionCount > 0 && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Icon source="cards-heart" size={18} color={FAV_COLOR} />
              <Text style={[styles.summaryText, {color: FAV_COLOR}]}>
                {counts.favorite}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Icon source="pause" size={18} color={HOLD_COLOR} />
              <Text style={[styles.summaryText, {color: HOLD_COLOR}]}>
                {counts.hold}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Icon source="close-thick" size={18} color={IGNORE_COLOR} />
              <Text style={[styles.summaryText, {color: IGNORE_COLOR}]}>
                {counts.ignore}
              </Text>
            </View>
          </View>
        )}
        <Text style={styles.emptySub}>
          {decidedAny ? t('DiscoveryReloadHint') : t('DiscoveryEmptyHint')}
        </Text>
        {decidedAny && (
          <Pressable
            onPress={handleReload}
            android_ripple={{color: 'rgba(255,255,255,0.18)'}}
            style={styles.reloadButton}>
            <Icon source="reload" size={20} color="#08120C" />
            <Text style={styles.reloadButtonText}>{t('DiscoveryReload')}</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const top = queue[0];
  const next = queue[1];

  return (
    <View style={styles.container}>
      {top ? (
        <>
          <Text style={styles.remaining}>
            {t('DiscoveryRemaining', {count: queue.length})}
          </Text>
          <View style={[styles.stack, {maxWidth: cardMaxWidth}]}>
            {next && (
              <View style={[styles.card, styles.cardBehind]}>
                {renderCardBody(next)}
              </View>
            )}
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.card,
                {
                  transform: [
                    {translateX: position.x},
                    {translateY: position.y},
                    {rotate},
                  ],
                },
              ]}>
              {renderCardBody(top)}
              <Animated.View
                style={[styles.ghost, styles.ghostFav, {opacity: favOpacity}]}>
                <Text style={[styles.ghostText, {color: FAV_COLOR}]}>
                  {t('Favorite')}
                </Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.ghost,
                  styles.ghostIgnore,
                  {opacity: ignoreOpacity},
                ]}>
                <Text style={[styles.ghostText, {color: IGNORE_COLOR}]}>
                  {t('Ignore')}
                </Text>
              </Animated.View>
              <Animated.View
                style={[
                  styles.ghost,
                  styles.ghostHold,
                  {opacity: holdOpacity},
                ]}>
                <Text style={[styles.ghostText, {color: HOLD_COLOR}]}>
                  {t('Hold')}
                </Text>
              </Animated.View>
            </Animated.View>
          </View>

          <View style={[styles.actions, {maxWidth: cardMaxWidth}]}>
            <Pressable
              onPress={() => commitWithAnimation(top, 'ignore')}
              android_ripple={{color: 'rgba(229,83,60,0.25)', borderless: true}}
              style={[styles.actionButton, styles.actionIgnore]}>
              <Icon source="close-thick" size={26} color={IGNORE_COLOR} />
              <Text style={[styles.actionLabel, {color: IGNORE_COLOR}]}>
                {t('Ignore')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => commitWithAnimation(top, 'hold')}
              android_ripple={{
                color: 'rgba(242,184,75,0.25)',
                borderless: true,
              }}
              style={[styles.actionButton, styles.actionHold]}>
              <Icon source="pause" size={26} color={HOLD_COLOR} />
              <Text style={[styles.actionLabel, {color: HOLD_COLOR}]}>
                {t('Hold')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => commitWithAnimation(top, 'favorite')}
              android_ripple={{color: 'rgba(47,210,75,0.25)', borderless: true}}
              style={[styles.actionButton, styles.actionFav]}>
              <Icon source="cards-heart" size={26} color={FAV_COLOR} />
              <Text style={[styles.actionLabel, {color: FAV_COLOR}]}>
                {t('Favorite')}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        renderEmpty()
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  remaining: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#8A9A92',
    marginBottom: 10,
  },
  stack: {
    width: '100%',
    aspectRatio: 0.72,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    backgroundColor: '#16211C',
    borderWidth: 1,
    borderColor: 'rgba(120,180,140,0.16)',
    overflow: 'hidden',
  },
  cardBehind: {
    transform: [{scale: 0.94}, {translateY: 14}],
    opacity: 0.6,
  },
  posterWrap: {
    flex: 1,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterSmall: {},
  posterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C2A23',
  },
  posterScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
    backgroundColor: 'rgba(11,17,14,0.55)',
  },
  playableBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(8,18,12,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(47,210,75,0.5)',
  },
  playableBadgeText: {
    color: FAV_COLOR,
    fontSize: 11,
    fontWeight: '800',
  },
  cardInfo: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#E6ECE8',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#8A9A92',
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1C2A23',
    borderWidth: 1,
    borderColor: 'rgba(120,180,140,0.16)',
  },
  genreChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B7C6BD',
  },
  ghost: {
    position: 'absolute',
    top: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3,
  },
  ghostFav: {
    right: 18,
    borderColor: FAV_COLOR,
    transform: [{rotate: '12deg'}],
  },
  ghostIgnore: {
    left: 18,
    borderColor: IGNORE_COLOR,
    transform: [{rotate: '-12deg'}],
  },
  ghostHold: {
    alignSelf: 'center',
    bottom: 24,
    top: undefined,
    borderColor: HOLD_COLOR,
  },
  ghostText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 22,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 6,
    height: 60,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#16211C',
  },
  actionIgnore: {
    borderColor: 'rgba(229,83,60,0.5)',
  },
  actionHold: {
    borderColor: 'rgba(242,184,75,0.5)',
  },
  actionFav: {
    borderColor: 'rgba(47,210,75,0.5)',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#E6ECE8',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: '#8A9A92',
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginVertical: 4,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '800',
  },
  reloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: FAV_COLOR,
  },
  reloadButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#08120C',
  },
});

export default DiscoveryScreen;
