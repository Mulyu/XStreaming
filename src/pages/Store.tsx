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
import {isSignedIn, getValidGfnJwt} from '../gfn/auth';
import {
  fetchGfnFullCatalog,
  getFreshFullCatalog,
  getCachedFullCatalog,
} from '../gfn/catalog';
import {getSettings} from '../store/settingStore';
import {getSystemRegion} from '../utils/locale';
import {
  deriveMarketLanguage,
  fetchPricesWithRetry,
  getPrice,
  isSaleForDisplay,
  PriceInfo,
} from '../utils/storePrice';
import {
  fetchXboxBrowsePage,
  getFreshXboxBrowsePage,
  XboxBrowseSort,
} from '../storeCharts/xboxBrowse';
import {
  fetchSteamChart,
  getFreshSteamChart,
  SteamChartEntry,
} from '../storeCharts/steamCharts';
import {
  buildGfnStoreRows,
  buildXboxStoreRows,
  dedupeByKey,
  hasMorePages,
  StoreRow,
} from './storeLogic';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const SALE_ACCENT = '#E67E22';

// Both Xbox's and Steam's charts are live search scans, not curated top-N
// lists -- deeper pages exist for as long as the caller wants to scroll. Cap
// total fetched entries so a deep scroll session can't scan the whole store.
const MAX_CHART_ENTRIES = 3000;

type Provider = 'xcloud' | 'gfn';
type ChartKind = 'best' | 'new';

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

  const [xboxProductIds, setXboxProductIds] = React.useState<string[]>([]);
  const [xboxNextCT, setXboxNextCT] = React.useState<string | undefined>();
  const [xboxHasMore, setXboxHasMore] = React.useState(true);
  const [xboxPriceMap, setXboxPriceMap] = React.useState<
    Record<string, PriceInfo>
  >({});

  const [steamEntries, setSteamEntries] = React.useState<SteamChartEntry[]>([]);
  const [steamHasMore, setSteamHasMore] = React.useState(true);

  // The two catalogs a chart entry gets matched against -- the same raw
  // shapes buildUnifiedCatalog already knows how to turn into a launchable
  // CatalogTitle, just fetched here instead of merged into one grid.
  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>([]);
  const [gfnGames, setGfnGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );
  // The public list (~1,100 titles) NVIDIA publishes for anonymous browsing
  // is missing plenty of titles that are genuinely on GFN (confirmed live:
  // Onimusha: Way of the Sword, Monster Hunter Wilds, PUBG, and VRChat are
  // all absent from it despite being real GFN titles) -- it's a stale
  // snapshot, not the source of truth. Signed-in users additionally get the
  // full, authenticated catalog (same call Library.tsx makes) merged in
  // alongside it -- see gfnBaseGames below for why this is a merge, not a
  // replacement.
  const [gfnFullCatalog, setGfnFullCatalog] = React.useState<GfnGame[]>(
    () => getCachedFullCatalog() || [],
  );

  // Bumped every time the provider or chart kind changes, so an async
  // fetch/loadMore chain started for a since-abandoned selection can tell it
  // was superseded and stop committing state instead of leaking stale rows
  // into whatever selection is now showing (pull-to-refresh re-fetches the
  // *same* selection, so it doesn't bump this).
  const selectionGenerationRef = React.useRef(0);
  // Synchronous re-entrancy guard for loadMore -- React state (loadingMore)
  // only updates on the next render, so two onEndReached calls fired back to
  // back before that render (a known FlatList quirk) would otherwise both
  // read the same stale "not loading" value and both fetch the same page,
  // duplicating rows.
  const loadMoreInFlightRef = React.useRef(false);

  const gameLanguage = getSettings().preferred_game_language;
  const deviceRegion = getSystemRegion();
  const {market, language} = deriveMarketLanguage(gameLanguage, deviceRegion);
  const xboxLocale = `${(language.split('-')[0] || 'en').toLowerCase()}-${(
    market || 'US'
  ).toLowerCase()}`;
  const steamCc = market || 'US';
  const steamLanguage = STEAM_LANGUAGE[getSettings().locale] || 'english';

  // xCloud's own catalog, for matching Xbox browse results back to a
  // launchable title (and the only source of the internal titleId a stream
  // actually starts with -- no public Store API exposes that, so this step
  // can't be skipped even though the browse results are already
  // CloudGaming-filtered). Same call Library.tsx makes, just not merged into
  // a combined grid here.
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
  // entries back to a launchable title while signed out, or before the full
  // catalog below has loaded.
  React.useEffect(() => {
    const cached = getCachedGfnGames();
    if (cached) {
      setGfnGames(cached);
    }
    fetchGfnGames()
      .then(setGfnGames)
      .catch(() => {});
  }, []);

  // The full, authenticated catalog -- requires a signed-in token, so it
  // simply stays empty (falling back to the public list) while signed out.
  // Cached 24h since a full paginated fetch is dozens of sequential
  // requests, not one.
  React.useEffect(() => {
    if (!isSignedIn()) {
      return;
    }
    const fresh = getFreshFullCatalog();
    if (fresh) {
      setGfnFullCatalog(fresh);
      return;
    }
    getValidGfnJwt().then(token => {
      if (!token) {
        return;
      }
      fetchGfnFullCatalog(token)
        .then(games => games.length > 0 && setGfnFullCatalog(games))
        .catch(() => {});
    });
  }, []);

  // Union, not "prefer the full catalog" -- live-verified the full catalog's
  // steamAppId is populated for only a tiny fraction of browse results (a
  // scan that should hit ~12% of Steam's topsellers on the public list's own
  // numbers instead found roughly 1-in-650, and the one hit found was a
  // title the account plausibly owns), so treating it as a strict
  // replacement silently threw away the public list's own reliable
  // steamAppId coverage. Concatenating keeps every reliable mapping from
  // either source; downstream Set/Map building already collapses duplicate
  // steamAppIds, and ordering the full catalog second lets its (richer,
  // when present) entry win a collision.
  const gfnBaseGames = React.useMemo(
    () => [...gfnGames, ...gfnFullCatalog],
    [gfnGames, gfnFullCatalog],
  );

  const xcloudByProductId = React.useMemo(() => {
    const map = new Map<string, any>();
    xcloudTitles.forEach(item => {
      if (item?.productId) {
        map.set(String(item.productId).toUpperCase(), item);
      }
    });
    return map;
  }, [xcloudTitles]);

  // Store prices aren't in the Game Pass catalog response (or the browse
  // endpoint, which returns bare ids) -- fetched in bulk for the whole
  // entitled catalog up front, same as Library.tsx does, so a price is
  // already known for any row by the time it's matched regardless of how
  // deep the browse pagination has gone.
  React.useEffect(() => {
    const productIds = xcloudTitles
      .map((item: any) => item.productId)
      .filter(Boolean);
    if (productIds.length === 0) {
      return;
    }
    fetchPricesWithRetry(productIds, market, language).then(({prices}) => {
      if (Object.keys(prices).length > 0) {
        setXboxPriceMap(prev => ({...prev, ...prices}));
      }
    });
  }, [xcloudTitles, market, language]);

  const loadChart = React.useCallback(
    (
      nextProvider: Provider,
      nextKind: ChartKind,
      force: boolean,
      generation: number,
    ) => {
      const stillCurrent = () => selectionGenerationRef.current === generation;
      if (nextProvider === 'xcloud') {
        const sort: XboxBrowseSort =
          nextKind === 'best' ? 'MostPopular desc' : 'ReleaseDate desc';
        if (!force) {
          const fresh = getFreshXboxBrowsePage(sort, xboxLocale);
          if (fresh) {
            setXboxProductIds(
              dedupeByKey(fresh.productIds, id => id.toUpperCase()),
            );
            setXboxNextCT(fresh.nextCT);
            setXboxHasMore(
              hasMorePages(
                fresh.productIds.length,
                fresh.productIds.length,
                fresh.totalCount,
              ),
            );
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        fetchXboxBrowsePage(sort, xboxLocale)
          .then(page => {
            if (!stillCurrent()) {
              return;
            }
            setXboxProductIds(
              dedupeByKey(page.productIds, id => id.toUpperCase()),
            );
            setXboxNextCT(page.nextCT);
            setXboxHasMore(
              hasMorePages(
                page.productIds.length,
                page.productIds.length,
                page.totalCount,
              ),
            );
          })
          .finally(() => {
            if (stillCurrent()) {
              setLoading(false);
            }
          });
      } else {
        const kind = nextKind === 'best' ? 'topsellers' : 'new';
        setSteamHasMore(true);
        if (!force) {
          const fresh = getFreshSteamChart(kind, steamCc);
          if (fresh) {
            setSteamEntries(dedupeByKey(fresh, e => e.appId));
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        fetchSteamChart(kind, steamCc, steamLanguage, 0)
          .then(page => {
            if (!stillCurrent()) {
              return;
            }
            setSteamEntries(dedupeByKey(page.entries, e => e.appId));
            setSteamHasMore(
              hasMorePages(
                page.entries.length,
                page.entries.length,
                page.totalCount,
              ),
            );
          })
          .finally(() => {
            if (stillCurrent()) {
              setLoading(false);
            }
          });
      }
    },
    [xboxLocale, steamCc, steamLanguage],
  );

  React.useEffect(() => {
    // A selection change supersedes whatever the previous one was doing --
    // bump the generation so a still-in-flight fetch or loadMore chain from
    // it notices and stops committing state, then drop its rows immediately
    // so they don't linger under the new selection's ranks/prices while the
    // fresh chart loads. Pull-to-refresh calls loadChart directly for the
    // *same* selection and intentionally does neither, so the old list stays
    // visible under the native refresh spinner instead of flashing empty.
    selectionGenerationRef.current += 1;
    const generation = selectionGenerationRef.current;
    if (provider === 'xcloud') {
      setXboxProductIds([]);
      setXboxNextCT(undefined);
      setXboxHasMore(true);
    } else {
      setSteamEntries([]);
      setSteamHasMore(true);
    }
    loadChart(provider, chartKind, false, generation);
  }, [provider, chartKind, loadChart]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadChart(provider, chartKind, true, selectionGenerationRef.current);
    setRefreshing(false);
  }, [provider, chartKind, loadChart]);

  const gfnSteamAppIds = React.useMemo(
    () =>
      new Set(
        gfnBaseGames
          .map(game => game.steamAppId)
          .filter((id): id is string => !!id),
      ),
    [gfnBaseGames],
  );

  // Both providers' charts can add a page that grows the raw list without
  // growing what's actually visible (an unmatched Xbox id, or -- much more
  // commonly -- a Steam id that isn't on GFN's much smaller catalog). When
  // that happens the rendered list's content size doesn't change, and
  // FlatList only re-arms onEndReached once the content size it last fired
  // at changes -- so a single call here doesn't stop at the next page: it
  // keeps fetching until a page actually grows the visible list (or the sale
  // filter's subset of it), the endpoint says there's no more, or the
  // per-session cap is hit -- guaranteeing every scroll-to-bottom either
  // grows the list or permanently ends pagination, never silently does
  // nothing.
  const loadMore = React.useCallback(async () => {
    if (loading || loadMoreInFlightRef.current) {
      return;
    }
    const generation = selectionGenerationRef.current;
    const stale = () => selectionGenerationRef.current !== generation;

    if (provider === 'xcloud') {
      if (!xboxHasMore || xboxProductIds.length >= MAX_CHART_ENTRIES) {
        return;
      }
      const sort: XboxBrowseSort =
        chartKind === 'best' ? 'MostPopular desc' : 'ReleaseDate desc';
      const isVisibleMatch = (id: string): boolean => {
        const item = xcloudByProductId.get(id.toUpperCase());
        if (!item) {
          return false;
        }
        if (!saleOnly) {
          return true;
        }
        const price = getPrice(xboxPriceMap, id);
        return !!price && isSaleForDisplay(price);
      };

      loadMoreInFlightRef.current = true;
      setLoadingMore(true);
      try {
        // Tracks ids already committed to xboxProductIds (plus any seen
        // earlier in this same loop) so a title the live ranking reshuffles
        // into a later page doesn't show up twice, and so a page that only
        // re-surfaces already-shown ids correctly doesn't count as
        // "found a new visible row".
        const seenIds = new Set(xboxProductIds.map(id => id.toUpperCase()));
        let ct = xboxNextCT;
        let count = xboxProductIds.length;
        let more = true;
        let foundVisibleRow = false;
        while (!foundVisibleRow && more && count < MAX_CHART_ENTRIES) {
          const page = await fetchXboxBrowsePage(sort, xboxLocale, ct);
          if (stale()) {
            return;
          }
          if (page.productIds.length === 0) {
            more = false;
            break;
          }
          count += page.productIds.length;
          ct = page.nextCT;
          more =
            hasMorePages(page.productIds.length, count, page.totalCount) &&
            !!ct;
          const newIds = page.productIds.filter(
            id => !seenIds.has(id.toUpperCase()),
          );
          newIds.forEach(id => seenIds.add(id.toUpperCase()));
          foundVisibleRow = newIds.some(isVisibleMatch);
          if (newIds.length > 0) {
            setXboxProductIds(prev => [...prev, ...newIds]);
          }
          setXboxNextCT(ct);
        }
        setXboxHasMore(more && count < MAX_CHART_ENTRIES);
      } finally {
        loadMoreInFlightRef.current = false;
        if (!stale()) {
          setLoadingMore(false);
        }
      }
    } else {
      if (!steamHasMore || steamEntries.length >= MAX_CHART_ENTRIES) {
        return;
      }
      const kind = chartKind === 'best' ? 'topsellers' : 'new';
      const isVisibleMatch = (entry: SteamChartEntry): boolean => {
        if (!gfnSteamAppIds.has(entry.appId)) {
          return false;
        }
        return saleOnly ? !!entry.originalPrice : true;
      };

      loadMoreInFlightRef.current = true;
      setLoadingMore(true);
      try {
        // Same reasoning as the Xbox branch above -- Steam's own ranking can
        // reshuffle between the several sequential requests one loadMore
        // call can make, so a title already shown can resurface on a later
        // page.
        const seenAppIds = new Set(steamEntries.map(e => e.appId));
        let start = steamEntries.length;
        let more = true;
        let foundVisibleRow = false;
        while (!foundVisibleRow && more && start < MAX_CHART_ENTRIES) {
          const page = await fetchSteamChart(
            kind,
            steamCc,
            steamLanguage,
            start,
          );
          if (stale()) {
            return;
          }
          if (page.entries.length === 0) {
            more = false;
            break;
          }
          start += page.entries.length;
          more = hasMorePages(page.entries.length, start, page.totalCount);
          const newEntries = page.entries.filter(e => !seenAppIds.has(e.appId));
          newEntries.forEach(e => seenAppIds.add(e.appId));
          foundVisibleRow = newEntries.some(isVisibleMatch);
          if (newEntries.length > 0) {
            setSteamEntries(prev => [...prev, ...newEntries]);
          }
        }
        setSteamHasMore(more && start < MAX_CHART_ENTRIES);
      } finally {
        loadMoreInFlightRef.current = false;
        if (!stale()) {
          setLoadingMore(false);
        }
      }
    }
  }, [
    provider,
    chartKind,
    steamCc,
    steamLanguage,
    steamEntries,
    steamHasMore,
    xboxLocale,
    xboxProductIds,
    xboxNextCT,
    xboxHasMore,
    xcloudByProductId,
    xboxPriceMap,
    saleOnly,
    gfnSteamAppIds,
    loading,
  ]);

  // Match this provider's raw chart against this provider's own catalog,
  // keeping the chart's own rank so a filtered-out title still leaves a
  // visible gap rather than silently compacting the list.
  const rows = React.useMemo(
    (): StoreRow[] =>
      provider === 'xcloud'
        ? buildXboxStoreRows(xboxProductIds, xcloudByProductId, xboxPriceMap)
        : buildGfnStoreRows(steamEntries, gfnBaseGames),
    [
      provider,
      xboxProductIds,
      xcloudByProductId,
      xboxPriceMap,
      steamEntries,
      gfnBaseGames,
    ],
  );

  const visibleRows = React.useMemo(
    () => (saleOnly ? rows.filter(row => !!row.originalPrice) : rows),
    [rows, saleOnly],
  );

  // The initial page-0 fetch above only ever tries one page, and it's common
  // for that single page to match zero cloud-playable titles -- confirmed
  // live that Steam's "New Releases" page 0 alone matches 0 of GFN's much
  // smaller catalog. Since the empty-state view below replaces the FlatList
  // entirely, its onEndReached (and with it, loadMore's own keep-fetching
  // loop) would otherwise never get a chance to run, permanently stranding
  // the screen on "not found" even though a match exists a few pages
  // deeper. So: once the initial load settles with nothing visible yet and
  // more pages exist, kick loadMore directly instead of waiting for a
  // scroll gesture on a list that was never rendered. Gated on the relevant
  // catalog having loaded at least once, so this doesn't burn through pages
  // while xcloudTitles/gfnBaseGames are still empty because *they* haven't
  // arrived yet (every row would look "no match" for that unrelated reason).
  const catalogReady =
    provider === 'xcloud' ? xcloudTitles.length > 0 : gfnBaseGames.length > 0;
  React.useEffect(() => {
    if (loading || loadingMore || visibleRows.length > 0 || !catalogReady) {
      return;
    }
    if (provider === 'xcloud' ? !xboxHasMore : !steamHasMore) {
      return;
    }
    loadMore();
  }, [
    loading,
    loadingMore,
    visibleRows.length,
    catalogReady,
    provider,
    xboxHasMore,
    steamHasMore,
    loadMore,
  ]);

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

      {visibleRows.length === 0 && (loading || loadingMore) ? (
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
          keyExtractor={item => item.id}
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
