import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import {useSelector, useDispatch} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {useIsFocused} from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import HubTabBar from '../components/HubTabBar';
import {getXcloudData, isxCloudDataValid} from '../store/xcloudStore';
import {loadCatalog} from '../utils/catalog';
import {getDecidedTitles, getDiscoveryId} from '../store/discoveryStore';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {deriveMarketLanguage} from '../utils/storePrice';
import {getFreshLeavingSoon} from '../store/priceStore';
import {buildLeavingSoonSet} from '../utils/leavingSoon';

const ACCENT = '#2FD24B';

const posterUrl = (item: any): string | null => {
  const img = item?.Image_Poster || item?.Image_Tile;
  return img?.URL ? 'https:' + img.URL : null;
};

const isStarred = (item: any, stars: string[]) =>
  stars.includes(item.XCloudTitleId) || stars.includes(item.titleId);

function DashboardScreen({navigation}: any) {
  const {t} = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const starTitles = useSelector((state: any) => state.stars || []);
  const ignoreTitles = useSelector((state: any) => state.ignores || []);

  const [cacheTick, setCacheTick] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const loadStartedRef = React.useRef(false);

  React.useEffect(() => {
    const sub = NetInfo.addEventListener((state: any) =>
      setOnline(!!state.isConnected),
    );
    return () => sub();
  }, []);

  // Seed favorites/ignores from the cache so the rails match the list screens,
  // and load the catalog if this is the first screen after login (empty cache).
  React.useEffect(() => {
    const cacheData = getXcloudData();
    if (cacheData) {
      dispatch({type: 'SET_STARS', payload: cacheData.starTitles || []});
      dispatch({type: 'SET_IGNORES', payload: cacheData.ignoreTitles || []});
    }
    if (
      !loadStartedRef.current &&
      (!cacheData || !isxCloudDataValid(cacheData))
    ) {
      loadStartedRef.current = true;
      setLoading(true);
      loadCatalog(streamingTokens)
        .then(() => setCacheTick(n => n + 1))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [dispatch, streamingTokens]);

  // Re-read the cache whenever the screen regains focus (e.g. after Library
  // refreshed it) so recently played / new arrivals stay current.
  React.useEffect(() => {
    if (isFocused) {
      setCacheTick(n => n + 1);
    }
  }, [isFocused]);

  const data = React.useMemo(() => {
    const cacheData = getXcloudData();
    const titles: any[] = (cacheData && cacheData.titles) || [];
    const newTitles: any[] = (cacheData && cacheData.newTitles) || [];
    const recentTitles: any[] = (cacheData && cacheData.recentTitles) || [];
    return {titles, newTitles, recentTitles};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheTick]);

  const favorites = React.useMemo(
    () => data.titles.filter((item: any) => isStarred(item, starTitles)),
    [data.titles, starTitles],
  );

  const leavingSoonSet = React.useMemo(() => {
    const {market} = deriveMarketLanguage(
      getSettings().preferred_game_language,
      getSystemRegion(),
    );
    const cached = getFreshLeavingSoon(market);
    return cached ? buildLeavingSoonSet(cached) : new Set<string>();
    // Recompute on focus/refresh (cacheTick) even though it isn't read directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheTick]);

  const leavingFavorite = React.useMemo(
    () =>
      favorites.find((item: any) =>
        leavingSoonSet.has(String(item.productId || '').toUpperCase()),
      ),
    [favorites, leavingSoonSet],
  );

  const discoveryRemaining = React.useMemo(() => {
    const decided = new Set(getDecidedTitles());
    const ignored = new Set(ignoreTitles);
    return data.titles.filter((item: any) => {
      const id = getDiscoveryId(item);
      return id && !decided.has(id) && !ignored.has(id);
    }).length;
  }, [data.titles, ignoreTitles]);

  const hero = data.recentTitles[0] || favorites[0] || data.titles[0];

  const openTitle = (item: any, autoStart = false) => {
    if (item) {
      navigation.navigate('TitleDetail', {titleItem: item, autoStart});
    }
  };

  const renderCard = (item: any, key: string, badge?: React.ReactNode) => {
    const url = posterUrl(item);
    return (
      <Pressable
        key={key}
        onPress={() => openTitle(item)}
        style={styles.card}
        android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
        <View style={styles.cardBox}>
          {url ? (
            <Image
              source={{uri: url}}
              resizeMode="cover"
              style={styles.cardImg}
            />
          ) : (
            <View style={styles.cardImgEmpty}>
              <Icon source="image-off-outline" size={24} color="#5C6C64" />
            </View>
          )}
          {isStarred(item, starTitles) && (
            <View style={styles.cardHeart}>
              <Text style={styles.cardHeartText}>♥</Text>
            </View>
          )}
          {badge}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.ProductTitle}
        </Text>
      </Pressable>
    );
  };

  const renderRail = (
    title: string,
    list: any[],
    keyPrefix: string,
    onMore?: () => void,
    badgeFor?: (item: any) => React.ReactNode,
  ) => {
    if (!list || list.length === 0) {
      return null;
    }
    return (
      <View style={styles.rail}>
        <View style={styles.railHead}>
          <View style={styles.railDot} />
          <Text style={styles.railTitle}>{title}</Text>
          {onMore && (
            <Pressable onPress={onMore} hitSlop={8}>
              <Text style={styles.railMore}>{t('All')} ›</Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railRow}>
          {list
            .slice(0, 12)
            .map((item: any, idx: number) =>
              renderCard(
                item,
                `${keyPrefix}_${idx}`,
                badgeFor ? badgeFor(item) : undefined,
              ),
            )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Icon source="account" size={26} color="#08120C" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.brand}>XStreaming</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {backgroundColor: online ? ACCENT : '#8A9A92'},
                ]}
              />
              <Text style={styles.statusText}>
                {online ? t('Powered on') : t('Powered off')}
              </Text>
            </View>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.loadingText}>{t('Loading...')}</Text>
          </View>
        )}

        {/* continue playing hero */}
        {hero && (
          <>
            <View style={styles.rail}>
              <View style={styles.railHead}>
                <View style={styles.railDot} />
                <Text style={styles.railTitle}>{t('DashboardContinue')}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => openTitle(hero, true)}
              style={styles.hero}
              android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
              {posterUrl(hero) ? (
                <Image
                  source={{uri: posterUrl(hero) as string}}
                  resizeMode="cover"
                  style={styles.heroImg}
                />
              ) : null}
              <View style={styles.heroScrim} />
              <View style={styles.heroContent}>
                <Text style={styles.heroLabel}>{t('DashboardResume')}</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {hero.ProductTitle}
                </Text>
                <View style={styles.heroPlay}>
                  <Icon source="play" size={16} color="#08120C" />
                  <Text style={styles.heroPlayText}>{t('Start game')}</Text>
                </View>
              </View>
            </Pressable>
          </>
        )}

        {/* favorites */}
        {renderRail(t('Stars'), favorites, 'fav', () =>
          navigation.navigate('Cloud'),
        )}

        {/* leaving soon alert */}
        {leavingFavorite && (
          <View style={styles.alert}>
            <Text style={styles.alertIcon}>⏳</Text>
            <View style={styles.alertText}>
              <Text style={styles.alertTitle}>{t('Leaving soon')}</Text>
              <Text style={styles.alertSub} numberOfLines={2}>
                {leavingFavorite.ProductTitle}
              </Text>
            </View>
          </View>
        )}

        {/* newest */}
        {renderRail(t('Newest'), data.newTitles, 'new', () =>
          navigation.navigate('Cloud'),
        )}

        {/* discovery CTA */}
        <Pressable
          onPress={() => navigation.navigate('Discovery')}
          style={styles.disc}
          android_ripple={{color: 'rgba(47,210,75,0.12)'}}>
          {discoveryRemaining > 0 && (
            <Text style={styles.discCount}>{discoveryRemaining}</Text>
          )}
          <Text style={styles.discTitle}>🎴 {t('Discovery')}</Text>
          <Text style={styles.discSub}>{t('DashboardDiscoverHint')}</Text>
          <View style={styles.discGo}>
            <Text style={styles.discGoText}>{t('DashboardDiscoverStart')}</Text>
          </View>
        </Pressable>
      </ScrollView>

      <HubTabBar active="home" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#8A9A92',
    fontWeight: '600',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  loadingText: {
    color: '#8A9A92',
  },
  rail: {
    paddingLeft: 16,
  },
  railHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
    marginBottom: 9,
  },
  railDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  railTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  railMore: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#8A9A92',
    fontWeight: '700',
  },
  railRow: {
    gap: 10,
    paddingRight: 16,
  },
  card: {
    width: 100,
  },
  cardBox: {
    width: 100,
    height: 134,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  cardImg: {
    width: '100%',
    height: '100%',
  },
  cardImgEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeart: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeartText: {
    color: '#ff4d6d',
    fontSize: 12,
    lineHeight: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 14,
  },
  hero: {
    marginHorizontal: 16,
    height: 158,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,14,11,0.42)',
  },
  heroContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    gap: 6,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: ACCENT,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroPlay: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ACCENT,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 2,
  },
  heroPlayText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#08120C',
  },
  alert: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(242,184,75,0.4)',
    backgroundColor: 'rgba(242,184,75,0.10)',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  alertIcon: {
    fontSize: 18,
  },
  alertText: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F2B84B',
  },
  alertSub: {
    fontSize: 12,
    color: '#8A9A92',
  },
  disc: {
    marginHorizontal: 16,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(47,210,75,0.28)',
    backgroundColor: 'rgba(47,210,75,0.10)',
    overflow: 'hidden',
  },
  discCount: {
    position: 'absolute',
    right: 14,
    top: 8,
    fontSize: 30,
    fontWeight: '900',
    color: 'rgba(47,210,75,0.45)',
  },
  discTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  discSub: {
    fontSize: 12,
    color: '#8A9A92',
    marginTop: 4,
    marginBottom: 10,
  },
  discGo: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(47,210,75,0.4)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  discGoText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },
});

export default DashboardScreen;
