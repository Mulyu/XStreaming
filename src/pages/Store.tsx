import React from 'react';
import {
  View,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import {Text, Icon, ActivityIndicator} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import XcloudApi from '../xCloud';
import {fetchGfnGames, getCachedGfnGames, GfnGame} from '../gfn/publicGames';
import {
  buildXcloudCatalogTitle,
  buildGfnCatalogTitle,
  CatalogTitle,
} from '../catalog/unifiedCatalog';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {deriveMarketLanguage} from '../utils/storePrice';
import {
  fetchXboxChart,
  getFreshXboxChart,
  XboxChartEntry,
} from '../storeCharts/xboxCharts';
import {
  fetchSteamChart,
  getFreshSteamChart,
  SteamChartEntry,
} from '../storeCharts/steamCharts';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const SALE_ACCENT = '#E67E22';

// Steam's chart is a live search scan, not a curated top-N list -- deeper
// pages exist for as long as the caller wants to scroll. Cap total fetched
// entries so a "New Releases" scroll session (matches against GFN's catalog
// are sparse -- see steamCharts.ts) can't scan the whole store.
const MAX_STEAM_ENTRIES = 3000;

type Provider = 'xcloud' | 'gfn';
type ChartKind = 'best' | 'new';

// One row's worth of display data, already matched back to a launchable
// catalog title -- rows that don't match anything cloud-playable never reach
// this shape, they're filtered out before render.
type StoreRow = {
  rank: number;
  title: string;
  imageUrl?: string;
  price?: string;
  originalPrice?: string;
  catalogTitle: CatalogTitle;
};

// Whether another Steam chart page is worth requesting after one that ended
// at `cumulativeStart`. Steam's search endpoint doesn't reliably return a
// full `count`-sized page even mid-list (confirmed live: a page can come
// back with 95-98 of a requested 100 rows while total_count is still in the
// thousands), so "got fewer than we asked for" is not a valid end-of-results
// signal -- only an empty page, or reaching the endpoint's own total_count,
// is.
const hasMoreSteamPages = (
  entriesLength: number,
  cumulativeStart: number,
  totalCount?: number,
): boolean => {
  if (entriesLength === 0) {
    return false;
  }
  return totalCount === undefined || cumulativeStart < totalCount;
};

const STEAM_LANGUAGE: Record<string, string> = {
  en: 'english',
  zh: 'schinese',
  zht: 'tchinese',
  de: 'german',
  es: 'spanish',
  pt: 'brazilian',
  ko: 'koreana',
  ja: 'japanese',
  hi: 'english',
};

function StoreScreen() {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const [provider, setProvider] = React.useState<Provider>('xcloud');
  const [chartKind, setChartKind] = React.useState<ChartKind>('best');
  const [saleOnly, setSaleOnly] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const [xboxEntries, setXboxEntries] = React.useState<XboxChartEntry[]>([]);
  const [steamEntries, setSteamEntries] = React.useState<SteamChartEntry[]>([]);
  // The Xbox chart is a fixed top-50 page (confirmed live -- query params
  // that would normally page a listing have no effect on it), so there's
  // never more to fetch there. Steam's is a live search scan that pages via
  // `start`, so it starts optimistic and flips false once a page comes back
  // short or past the endpoint's own total_count.
  const [steamHasMore, setSteamHasMore] = React.useState(true);

  // The two catalogs a chart entry gets matched against -- the same raw
  // shapes buildUnifiedCatalog already knows how to turn into a launchable
  // CatalogTitle, just fetched here instead of merged into one grid.
  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>([]);
  const [gfnGames, setGfnGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );

  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();
  const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
  const xboxLocale = `${(language.split('-')[0] || 'en').toLowerCase()}-${(
    market || 'US'
  ).toLowerCase()}`;
  const steamCc = market || 'US';
  const steamLanguage = STEAM_LANGUAGE[getSettings().locale] || 'english';

  // xCloud's own catalog, for matching Xbox Store chart entries back to a
  // launchable title -- same call Library.tsx makes, just not merged into a
  // combined grid here.
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

  // GFN's public catalog (no sign-in needed), for matching Steam chart
  // entries back to a launchable title. The public list is enough here --
  // it's only used to answer "is this Steam app on GFN at all", not to
  // browse the full catalog.
  React.useEffect(() => {
    const cached = getCachedGfnGames();
    if (cached) {
      setGfnGames(cached);
    }
    fetchGfnGames()
      .then(setGfnGames)
      .catch(() => {});
  }, []);

  const loadChart = React.useCallback(
    (nextProvider: Provider, nextKind: ChartKind, force = false) => {
      if (nextProvider === 'xcloud') {
        const kind = nextKind === 'best' ? 'topPaid' : 'new';
        if (!force) {
          const fresh = getFreshXboxChart(kind, xboxLocale);
          if (fresh) {
            setXboxEntries(fresh);
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        fetchXboxChart(kind, xboxLocale)
          .then(setXboxEntries)
          .finally(() => setLoading(false));
      } else {
        const kind = nextKind === 'best' ? 'topsellers' : 'new';
        setSteamHasMore(true);
        if (!force) {
          const fresh = getFreshSteamChart(kind, steamCc);
          if (fresh) {
            setSteamEntries(fresh);
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        fetchSteamChart(kind, steamCc, steamLanguage, 0)
          .then(page => {
            setSteamEntries(page.entries);
            setSteamHasMore(
              hasMoreSteamPages(
                page.entries.length,
                page.entries.length,
                page.totalCount,
              ),
            );
          })
          .finally(() => setLoading(false));
      }
    },

    [xboxLocale, steamCc, steamLanguage],
  );

  React.useEffect(() => {
    // Drop the previous selection's rows immediately -- otherwise they stay
    // on screen (mixed in under the new selection's ranks/prices) until the
    // new chart's fetch resolves. Pull-to-refresh calls loadChart directly
    // for the *same* selection and intentionally skips this, so the old list
    // stays visible under the native refresh spinner instead of flashing
    // empty.
    if (provider === 'xcloud') {
      setXboxEntries([]);
    } else {
      setSteamEntries([]);
      setSteamHasMore(true);
    }
    loadChart(provider, chartKind);
  }, [provider, chartKind, loadChart]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadChart(provider, chartKind, true);
    setRefreshing(false);
  }, [provider, chartKind, loadChart]);

  // Steam-backed titles on GFN are a small, slow-growing set (~1,100) next to
  // Steam's own charts, so a single 100-item page can easily add zero titles
  // that are actually on GFN -- and when a page adds nothing, the rendered
  // list's content size doesn't change, so FlatList's onEndReached never
  // fires again (it only re-arms once the content size it last fired at
  // changes). So a single call here doesn't stop at the next page: it keeps
  // fetching until a page actually grows the visible list (or the sale
  // filter's subset of it), Steam's own endpoint says there's no more, or the
  // per-session cap is hit -- guaranteeing every scroll-to-bottom either grows
  // the list or permanently ends pagination, never silently does nothing.
  const gfnSteamAppIds = React.useMemo(
    () =>
      new Set(
        gfnGames
          .map(game => game.steamAppId)
          .filter((id): id is string => !!id),
      ),
    [gfnGames],
  );

  const loadMore = React.useCallback(async () => {
    if (
      provider !== 'gfn' ||
      loading ||
      loadingMore ||
      !steamHasMore ||
      steamEntries.length >= MAX_STEAM_ENTRIES
    ) {
      return;
    }
    const kind = chartKind === 'best' ? 'topsellers' : 'new';
    const isVisibleMatch = (entry: SteamChartEntry): boolean => {
      if (!gfnSteamAppIds.has(entry.appId)) {
        return false;
      }
      return saleOnly ? !!entry.originalPrice : true;
    };

    setLoadingMore(true);
    try {
      let start = steamEntries.length;
      let more = true;
      let foundVisibleRow = false;
      while (!foundVisibleRow && more && start < MAX_STEAM_ENTRIES) {
        const page = await fetchSteamChart(kind, steamCc, steamLanguage, start);
        if (page.entries.length === 0) {
          more = false;
          break;
        }
        start += page.entries.length;
        foundVisibleRow = page.entries.some(isVisibleMatch);
        more = hasMoreSteamPages(page.entries.length, start, page.totalCount);
        setSteamEntries(prev => [...prev, ...page.entries]);
      }
      setSteamHasMore(more && start < MAX_STEAM_ENTRIES);
    } finally {
      setLoadingMore(false);
    }
  }, [
    provider,
    chartKind,
    steamCc,
    steamLanguage,
    steamEntries.length,
    steamHasMore,
    saleOnly,
    gfnSteamAppIds,
    loading,
    loadingMore,
  ]);

  // Match this provider's raw chart against this provider's own catalog,
  // keeping the chart's own rank so a filtered-out title still leaves a
  // visible gap rather than silently compacting the list.
  const rows = React.useMemo((): StoreRow[] => {
    if (provider === 'xcloud') {
      const byProductId = new Map<string, any>();
      xcloudTitles.forEach(item => {
        if (item?.productId) {
          byProductId.set(String(item.productId).toUpperCase(), item);
        }
      });
      const result: StoreRow[] = [];
      xboxEntries.forEach((entry, index) => {
        const item = byProductId.get(entry.productId.toUpperCase());
        if (!item) {
          return;
        }
        const catalogTitle = buildXcloudCatalogTitle(item);
        if (!catalogTitle) {
          return;
        }
        result.push({
          rank: index + 1,
          title: entry.title,
          imageUrl: entry.imageUrl,
          price: entry.price,
          originalPrice: entry.originalPrice,
          catalogTitle,
        });
      });
      return result;
    }

    const byAppId = new Map<string, GfnGame>();
    gfnGames.forEach(game => {
      if (game.steamAppId) {
        byAppId.set(game.steamAppId, game);
      }
    });
    const result: StoreRow[] = [];
    steamEntries.forEach((entry, index) => {
      const game = byAppId.get(entry.appId);
      if (!game) {
        return;
      }
      const catalogTitle = buildGfnCatalogTitle(game);
      if (!catalogTitle) {
        return;
      }
      result.push({
        rank: index + 1,
        title: entry.title,
        imageUrl: entry.imageUrl,
        price: entry.price,
        originalPrice: entry.originalPrice,
        catalogTitle,
      });
    });
    return result;
  }, [provider, xboxEntries, steamEntries, xcloudTitles, gfnGames]);

  const visibleRows = React.useMemo(
    () => (saleOnly ? rows.filter(row => !!row.originalPrice) : rows),
    [rows, saleOnly],
  );

  const openRow = React.useCallback(
    (row: StoreRow) => {
      navigation.navigate('LibraryTitleDetail', {
        catalogTitle: row.catalogTitle,
      });
    },
    [navigation],
  );

  const renderRow = ({item}: {item: StoreRow}) => (
    <Pressable
      style={styles.row}
      onPress={() => openRow(item)}
      android_ripple={{color: 'rgba(150,150,150,0.12)'}}>
      <Text style={styles.rank}>#{item.rank}</Text>
      {item.imageUrl ? (
        <Image source={{uri: item.imageUrl}} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.price && (
          <View style={styles.priceRow}>
            {!!item.originalPrice && (
              <Text style={styles.originalPrice}>{item.originalPrice}</Text>
            )}
            <Text style={[styles.price, !!item.originalPrice && styles.onSale]}>
              {item.price}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderFooter = () =>
    loadingMore ? (
      <View style={styles.footer}>
        <ActivityIndicator size="small" />
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Store')}</Text>
        <View style={styles.tabRow}>
          <Pressable
            style={[
              styles.tab,
              provider === 'xcloud' && {
                backgroundColor: XBOX_ACCENT,
                borderColor: XBOX_ACCENT,
              },
            ]}
            onPress={() => setProvider('xcloud')}>
            <Text
              style={[
                styles.tabText,
                provider === 'xcloud' && styles.tabTextOn,
              ]}>
              {t('StoreTabXbox')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              provider === 'gfn' && {
                backgroundColor: NVIDIA_ACCENT,
                borderColor: NVIDIA_ACCENT,
              },
            ]}
            onPress={() => setProvider('gfn')}>
            <Text
              style={[styles.tabText, provider === 'gfn' && styles.tabTextOn]}>
              {t('StoreTabSteam')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.kindRow}>
          <Pressable
            style={[styles.kindChip, chartKind === 'best' && styles.kindOn]}
            onPress={() => setChartKind('best')}>
            <Text
              style={[
                styles.kindText,
                chartKind === 'best' && styles.kindTextOn,
              ]}>
              {t('StoreBestSellers')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.kindChip, chartKind === 'new' && styles.kindOn]}
            onPress={() => setChartKind('new')}>
            <Text
              style={[
                styles.kindText,
                chartKind === 'new' && styles.kindTextOn,
              ]}>
              {t('StoreNewReleases')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.kindChip, saleOnly && styles.kindOnSale]}
            onPress={() => setSaleOnly(prev => !prev)}>
            <Text style={[styles.kindText, saleOnly && styles.kindTextOnSale]}>
              {t('LibraryFilterOnSale')}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.subnote}>{t('StoreFilteredNote')}</Text>
      </View>

      {loading && visibleRows.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : visibleRows.length === 0 ? (
        <View style={styles.centre}>
          <Icon source="cart-off" size={34} color="#5C6963" />
          <Text style={styles.centreText}>{t('StoreEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={item => item.catalogTitle.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 10},
  title: {fontSize: 18, fontWeight: '800'},
  tabRow: {flexDirection: 'row', gap: 8},
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.3)',
    backgroundColor: 'rgba(140,140,150,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {fontSize: 12.5, fontWeight: '700', color: '#8A9A92'},
  tabTextOn: {color: '#EAFFF0'},
  kindRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  kindChip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindOn: {backgroundColor: 'rgba(232,179,74,0.9)'},
  kindOnSale: {backgroundColor: SALE_ACCENT},
  kindText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  kindTextOn: {color: '#2B1D02'},
  kindTextOnSale: {color: '#2B1200'},
  subnote: {fontSize: 11, color: '#5C6963'},
  list: {paddingHorizontal: 14, paddingBottom: 24},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rank: {
    width: 28,
    fontSize: 14,
    fontWeight: '700',
    color: '#5C6963',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  cover: {width: 48, height: 48, borderRadius: 8, backgroundColor: '#222'},
  coverPlaceholder: {backgroundColor: 'rgba(140,140,150,0.2)'},
  rowBody: {flex: 1, minWidth: 0, gap: 3},
  rowTitle: {fontSize: 13.5, fontWeight: '600'},
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  price: {fontSize: 12, color: '#8A9A92'},
  originalPrice: {
    fontSize: 11,
    color: '#5C6963',
    textDecorationLine: 'line-through',
  },
  onSale: {color: SALE_ACCENT, fontWeight: '700'},
  footer: {paddingVertical: 16, alignItems: 'center'},
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  centreText: {fontSize: 13, color: '#8A9A92'},
});

export default StoreScreen;
