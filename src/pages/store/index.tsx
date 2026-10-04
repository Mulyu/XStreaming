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
import {useTVFocus, tvFocusRing} from '../../shared/ui/tvFocus';
import {useNavigation} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import {
  loadXcloudCatalog,
  deriveMarketLanguage,
  fetchPricesWithRetry,
  getPrice,
  isSaleForDisplay,
  PriceInfo,
  GfnGame,
  fetchGfnFullCatalog,
  getFreshFullCatalog,
  getCachedFullCatalog,
  getPsStoreLocale,
} from '../../entities/catalog-title';
import {isSignedIn, getValidGfnJwt} from '../../entities/gfn-account';
import {
  isPsPlusSignedIn,
  getNpsso,
  fetchUnifiedCatalog,
  CloudGame,
  getCachedCatalogGames,
  saveCatalogGames,
} from '../../features/ps-plus-session';
import {getSettings} from '../../shared/lib/settings';
import {getSystemRegion} from '../../shared/lib/locale';
import {
  fetchXboxBrowsePage,
  getFreshXboxBrowsePage,
  XboxBrowseSort,
  fetchSteamChart,
  getFreshSteamChart,
  SteamChartEntry,
  fetchPsStoreChart,
  getFreshPsStoreChart,
  PsStoreChartEntry,
} from '../../features/store-charts';
import {
  buildGfnStoreRows,
  buildXboxStoreRows,
  buildPsStoreRows,
  dedupeByKey,
  hasMorePages,
  StoreRow,
} from './storeLogic';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const PS_ACCENT = '#0070D1';
const SALE_ACCENT = '#E67E22';

// Both Xbox's and Steam's charts are live search scans, not curated top-N
// lists -- deeper pages exist for as long as the caller wants to scroll. Cap
// total fetched entries so a deep scroll session can't scan the whole store.
const MAX_CHART_ENTRIES = 3000;

// Keep auto-continuing the initial load until at least this many rows are
// visible (or pages run out) -- not just until the first non-empty page.
// GFN's catalog only overlaps a small slice of Steam's chart (confirmed live:
// a 100-title Top Sellers page can match a literal handful of GFN titles), so
// stopping as soon as *any* match was found used to strand the screen on a
// short list that fits entirely on-screen with nothing to scroll -- and
// FlatList's onEndReached doesn't reliably re-fire for a list that never
// grows past the viewport, so it silently never fetched page 2 onward.
const MIN_VISIBLE_ROWS = 15;

type Provider = 'xcloud' | 'gfn' | 'psstore';
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
  // GFN/Steam-only: off by default, showing Steam's full chart (including
  // titles not on GFN, with a null catalogTitle -- see buildGfnStoreRows).
  // The Xbox/xCloud tab has no equivalent toggle: its browse endpoint only
  // returns bare product ids with no display data of their own, so a row
  // there only exists once matched against the entitled catalog in the first
  // place (see storeLogic.ts's StoreRow comment).
  const [gfnAvailableOnly, setGfnAvailableOnly] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // Loading state is tracked per provider, not as one shared flag -- a
  // shared flag meant "is *a* chart loading", not "is the chart the screen
  // is currently showing loading", so switching tabs while the other
  // provider's fetch was still in flight could clear it (or leave it stuck)
  // for a reason that had nothing to do with the chart actually on screen,
  // showing StoreEmpty instead of a spinner (or vice versa).
  const [xboxLoading, setXboxLoading] = React.useState(true);
  const [xboxLoadingMore, setXboxLoadingMore] = React.useState(false);
  const [steamLoading, setSteamLoading] = React.useState(true);
  const [steamLoadingMore, setSteamLoadingMore] = React.useState(false);
  const [psStoreLoading, setPsStoreLoading] = React.useState(true);
  const [psStoreLoadingMore, setPsStoreLoadingMore] = React.useState(false);
  const loading =
    provider === 'xcloud'
      ? xboxLoading
      : provider === 'gfn'
      ? steamLoading
      : psStoreLoading;
  const loadingMore =
    provider === 'xcloud'
      ? xboxLoadingMore
      : provider === 'gfn'
      ? steamLoadingMore
      : psStoreLoadingMore;

  const [xboxProductIds, setXboxProductIds] = React.useState<string[]>([]);
  const [xboxNextCT, setXboxNextCT] = React.useState<string | undefined>();
  const [xboxHasMore, setXboxHasMore] = React.useState(true);
  const [xboxPriceMap, setXboxPriceMap] = React.useState<
    Record<string, PriceInfo>
  >({});
  // The chart kind ('best'/'new') each provider's currently-held entries
  // were loaded for, so switching tabs back to a provider that already has
  // *this* kind loaded reuses what's there instead of throwing away
  // scroll-accumulated pages and re-fetching from page 0 (chartKind is one
  // shared selector across both tabs, so a kind change still invalidates
  // whichever provider's data doesn't match it -- lazily, the next time that
  // provider's tab becomes active).
  const [xboxLoadedKind, setXboxLoadedKind] = React.useState<ChartKind | null>(
    null,
  );

  const [steamEntries, setSteamEntries] = React.useState<SteamChartEntry[]>([]);
  const [steamHasMore, setSteamHasMore] = React.useState(true);
  // The numeric `start` offset to resume Steam's search endpoint from --
  // tracked explicitly instead of derived from steamEntries.length (the
  // way Xbox's own xboxNextCT cursor is never derived from
  // xboxProductIds.length either, for the same reason): entries filtered
  // out as already-seen (a title the live ranking resurfaces at a later
  // offset -- see dedupeByKey's own comment) make steamEntries.length
  // permanently undercount how many raw rows the server has actually
  // handed out, so deriving the next request's `start` from it silently
  // re-requests rows already consumed instead of advancing -- and once
  // that gap opens it never closes, since every later loadMore call
  // inherits the same undercount.
  const [steamNextStart, setSteamNextStart] = React.useState(0);
  const [steamLoadedKind, setSteamLoadedKind] =
    React.useState<ChartKind | null>(null);

  // Same shape as Steam's own chart state above -- PS Store's category API
  // is offset-paginated too, just numerically like Steam's `start` rather
  // than Xbox's opaque continuation token.
  const [psStoreEntries, setPsStoreEntries] = React.useState<
    PsStoreChartEntry[]
  >([]);
  const [psStoreHasMore, setPsStoreHasMore] = React.useState(true);
  const [psStoreNextOffset, setPsStoreNextOffset] = React.useState(0);
  const [psStoreLoadedKind, setPsStoreLoadedKind] =
    React.useState<ChartKind | null>(null);
  // PS Store-only, mirroring gfnAvailableOnly: off by default, showing PS
  // Store's full chart (including titles not in the signed-in account's PS
  // Plus cloud-streaming catalog, with a null catalogTitle).
  const [psPlusAvailableOnly, setPsPlusAvailableOnly] = React.useState(false);

  // The two catalogs a chart entry gets matched against -- the same raw
  // shapes buildUnifiedCatalog already knows how to turn into a launchable
  // CatalogTitle, just fetched here instead of merged into one grid.
  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>([]);
  // The full, authenticated GFN browse catalog -- the ONLY source this
  // screen matches Steam chart entries against (see fetchGfnFullCatalog's
  // own comment: the small public JSON snapshot is no longer consulted here,
  // since it's live-verified to omit entire franchises). Empty while signed
  // out or before the first successful load.
  const [gfnFullCatalog, setGfnFullCatalog] = React.useState<GfnGame[]>(
    () => getCachedFullCatalog() || [],
  );
  // PS Plus's own pscloud catalog -- the ONLY source this screen matches PS
  // Store chart entries against, same "requires a signed-in account, stays
  // empty otherwise" shape as gfnFullCatalog above. Instant-paints from the
  // same JS-side cache the Library screen already maintains.
  const [psPlusGames, setPsPlusGames] = React.useState<CloudGame[]>(
    () => getCachedCatalogGames() || [],
  );

  // Bumped every time *that provider's own* chart is (re)loaded, so an async
  // fetch/loadMore chain started for a since-abandoned load of that same
  // provider can tell it was superseded and stop committing state instead of
  // leaking stale rows into whatever's now showing for it (pull-to-refresh
  // re-fetches the *same* generation, so it doesn't bump this). Kept
  // per-provider rather than as one shared counter: switching tabs no longer
  // force-reloads a provider that's already loaded for the current chart
  // kind (see xboxLoadedKind/steamLoadedKind above), so a provider's chart
  // can legitimately keep loading in the background while the other tab is
  // shown, and that must not get invalidated just because the *other*
  // provider started its own load in the meantime.
  const xboxGenerationRef = React.useRef(0);
  const steamGenerationRef = React.useRef(0);
  const psStoreGenerationRef = React.useRef(0);
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
    loadXcloudCatalog(streamingTokens.xCloudToken).then(({titles}) => {
      if (titles.length > 0) {
        setXcloudTitles(titles);
      }
    });
  }, [streamingTokens?.xCloudToken]);

  // The full, authenticated catalog -- requires a signed-in token, so it
  // simply stays empty while signed out (there is no fallback catalog to
  // match Steam chart entries against instead -- see gfnFullCatalog's own
  // comment above). Cached 24h since a full paginated fetch is dozens of
  // sequential requests, not one.
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
        .then(({games}) => games.length > 0 && setGfnFullCatalog(games))
        .catch(() => {});
    });
  }, []);

  // Same idea, PS Plus's side: needs a signed-in PSN account (npsso), mirrors
  // useLibraryScreen.ts's own loadPsPlusGames exactly (same cache, same
  // pscloud-only filter -- PS Now/PS3/PS4 titles aren't reachable from this
  // app's PS Plus stream page).
  React.useEffect(() => {
    if (!isPsPlusSignedIn()) {
      return;
    }
    const npsso = getNpsso();
    if (!npsso) {
      return;
    }
    fetchUnifiedCatalog(npsso, undefined, false)
      .then(result => {
        const games = result.games.filter(
          g => g.streamServiceType === 'pscloud',
        );
        if (games.length > 0) {
          setPsPlusGames(games);
          saveCatalogGames(games);
        }
      })
      .catch(() => {});
  }, []);

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
      const genRef =
        nextProvider === 'xcloud'
          ? xboxGenerationRef
          : nextProvider === 'gfn'
          ? steamGenerationRef
          : psStoreGenerationRef;
      const stillCurrent = () => genRef.current === generation;
      const setProviderLoading =
        nextProvider === 'xcloud'
          ? setXboxLoading
          : nextProvider === 'gfn'
          ? setSteamLoading
          : setPsStoreLoading;
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
            setProviderLoading(false);
            return;
          }
        }
        setProviderLoading(true);
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
              setProviderLoading(false);
            }
          });
      } else if (nextProvider === 'gfn') {
        const kind = nextKind === 'best' ? 'topsellers' : 'new';
        setSteamHasMore(true);
        if (!force) {
          const fresh = getFreshSteamChart(kind, steamCc);
          if (fresh) {
            setSteamEntries(dedupeByKey(fresh, e => e.appId));
            // The cache only stores the already-deduped page, but it's
            // sourced from a single page-0 request, which live testing
            // confirms never returns intra-page duplicate appIds -- so its
            // length is the true offset the server considers already
            // handed out.
            setSteamNextStart(fresh.length);
            setProviderLoading(false);
            return;
          }
        }
        setProviderLoading(true);
        fetchSteamChart(kind, steamCc, steamLanguage, 0)
          .then(page => {
            if (!stillCurrent()) {
              return;
            }
            setSteamEntries(dedupeByKey(page.entries, e => e.appId));
            // The *raw* count, not the deduped one -- this is the true
            // server-side offset to resume from next, regardless of
            // whether any of page 0's own rows got deduped away.
            setSteamNextStart(page.entries.length);
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
              setProviderLoading(false);
            }
          });
      } else {
        const kind = nextKind === 'best' ? 'topsellers' : 'new';
        setPsStoreHasMore(true);
        if (!force) {
          const fresh = getFreshPsStoreChart(kind, getPsStoreLocale());
          if (fresh) {
            setPsStoreEntries(dedupeByKey(fresh, e => e.productId));
            setPsStoreNextOffset(fresh.length);
            setProviderLoading(false);
            return;
          }
        }
        setProviderLoading(true);
        fetchPsStoreChart(kind, 0)
          .then(page => {
            if (!stillCurrent()) {
              return;
            }
            setPsStoreEntries(dedupeByKey(page.entries, e => e.productId));
            setPsStoreNextOffset(page.entries.length);
            setPsStoreHasMore(
              hasMorePages(
                page.entries.length,
                page.entries.length,
                page.totalCount,
              ),
            );
          })
          .finally(() => {
            if (stillCurrent()) {
              setProviderLoading(false);
            }
          });
      }
    },
    [xboxLocale, steamCc, steamLanguage],
  );

  React.useEffect(() => {
    // Switching tabs alone is not a reason to throw away and re-fetch a
    // provider's chart -- if it's already loaded for the chart kind
    // currently selected (whether that load finished or is still going in
    // the background), just leave it be so scroll-accumulated pages survive
    // flipping between tabs. Only a genuinely new (provider, chartKind)
    // combination triggers a reset + fetch, which bumps that provider's own
    // generation so a still-in-flight fetch/loadMore chain from its previous
    // load notices it was superseded and stops committing state. Pull-to-
    // refresh calls loadChart directly without bumping the generation, so
    // the old list stays visible under the native refresh spinner instead of
    // flashing empty.
    const alreadyLoaded =
      provider === 'xcloud'
        ? xboxLoadedKind === chartKind
        : provider === 'gfn'
        ? steamLoadedKind === chartKind
        : psStoreLoadedKind === chartKind;
    if (alreadyLoaded) {
      return;
    }
    const genRef =
      provider === 'xcloud'
        ? xboxGenerationRef
        : provider === 'gfn'
        ? steamGenerationRef
        : psStoreGenerationRef;
    genRef.current += 1;
    const generation = genRef.current;
    if (provider === 'xcloud') {
      setXboxProductIds([]);
      setXboxNextCT(undefined);
      setXboxHasMore(true);
      setXboxLoadedKind(chartKind);
    } else if (provider === 'gfn') {
      setSteamEntries([]);
      setSteamHasMore(true);
      setSteamNextStart(0);
      setSteamLoadedKind(chartKind);
    } else {
      setPsStoreEntries([]);
      setPsStoreHasMore(true);
      setPsStoreNextOffset(0);
      setPsStoreLoadedKind(chartKind);
    }
    loadChart(provider, chartKind, false, generation);
  }, [
    provider,
    chartKind,
    loadChart,
    xboxLoadedKind,
    steamLoadedKind,
    psStoreLoadedKind,
  ]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    const genRef =
      provider === 'xcloud'
        ? xboxGenerationRef
        : provider === 'gfn'
        ? steamGenerationRef
        : psStoreGenerationRef;
    loadChart(provider, chartKind, true, genRef.current);
    setRefreshing(false);
  }, [provider, chartKind, loadChart]);

  const gfnSteamAppIds = React.useMemo(
    () =>
      new Set(
        gfnFullCatalog
          .map(game => game.steamAppId)
          .filter((id): id is string => !!id),
      ),
    [gfnFullCatalog],
  );

  // Both productId and storeProductId, not storeProductId alone -- see
  // storeLogic.ts's buildPsStoreRows for why (storeProductId is only
  // populated for owned/purchaseable rows, never a "streamable" PS Plus
  // catalog title, per libchiaki's own JSON contract).
  const psPlusStoreProductIds = React.useMemo(
    () =>
      new Set(
        psPlusGames.flatMap(game =>
          [game.productId, game.storeProductId].filter(
            (id): id is string => !!id,
          ),
        ),
      ),
    [psPlusGames],
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

    if (provider === 'xcloud') {
      const generation = xboxGenerationRef.current;
      const stale = () => xboxGenerationRef.current !== generation;
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
      setXboxLoadingMore(true);
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
          setXboxLoadingMore(false);
        }
      }
    } else if (provider === 'gfn') {
      const generation = steamGenerationRef.current;
      const stale = () => steamGenerationRef.current !== generation;
      if (!steamHasMore || steamNextStart >= MAX_CHART_ENTRIES) {
        return;
      }
      const kind = chartKind === 'best' ? 'topsellers' : 'new';
      const isVisibleMatch = (entry: SteamChartEntry): boolean => {
        if (gfnAvailableOnly && !gfnSteamAppIds.has(entry.appId)) {
          return false;
        }
        return saleOnly ? !!entry.originalPrice : true;
      };

      loadMoreInFlightRef.current = true;
      setSteamLoadingMore(true);
      try {
        // Same reasoning as the Xbox branch above -- Steam's own ranking can
        // reshuffle between the several sequential requests one loadMore
        // call can make, so a title already shown can resurface on a later
        // page.
        const seenAppIds = new Set(steamEntries.map(e => e.appId));
        let start = steamNextStart;
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
        setSteamNextStart(start);
        setSteamHasMore(more && start < MAX_CHART_ENTRIES);
      } finally {
        loadMoreInFlightRef.current = false;
        if (!stale()) {
          setSteamLoadingMore(false);
        }
      }
    } else {
      const generation = psStoreGenerationRef.current;
      const stale = () => psStoreGenerationRef.current !== generation;
      if (!psStoreHasMore || psStoreNextOffset >= MAX_CHART_ENTRIES) {
        return;
      }
      const kind = chartKind === 'best' ? 'topsellers' : 'new';
      const isVisibleMatch = (entry: PsStoreChartEntry): boolean => {
        if (
          psPlusAvailableOnly &&
          !psPlusStoreProductIds.has(entry.productId)
        ) {
          return false;
        }
        return saleOnly ? !!entry.originalPrice : true;
      };

      loadMoreInFlightRef.current = true;
      setPsStoreLoadingMore(true);
      try {
        // Same reasoning as the Steam branch above -- the category's own
        // "Best Selling" ranking can reshuffle between the several
        // sequential requests one loadMore call can make.
        const seenProductIds = new Set(psStoreEntries.map(e => e.productId));
        let offset = psStoreNextOffset;
        let more = true;
        let foundVisibleRow = false;
        while (!foundVisibleRow && more && offset < MAX_CHART_ENTRIES) {
          const page = await fetchPsStoreChart(kind, offset);
          if (stale()) {
            return;
          }
          if (page.entries.length === 0) {
            more = false;
            break;
          }
          offset += page.entries.length;
          more = hasMorePages(page.entries.length, offset, page.totalCount);
          const newEntries = page.entries.filter(
            e => !seenProductIds.has(e.productId),
          );
          newEntries.forEach(e => seenProductIds.add(e.productId));
          foundVisibleRow = newEntries.some(isVisibleMatch);
          if (newEntries.length > 0) {
            setPsStoreEntries(prev => [...prev, ...newEntries]);
          }
        }
        setPsStoreNextOffset(offset);
        setPsStoreHasMore(more && offset < MAX_CHART_ENTRIES);
      } finally {
        loadMoreInFlightRef.current = false;
        if (!stale()) {
          setPsStoreLoadingMore(false);
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
    steamNextStart,
    xboxLocale,
    xboxProductIds,
    xboxNextCT,
    xboxHasMore,
    xcloudByProductId,
    xboxPriceMap,
    saleOnly,
    gfnAvailableOnly,
    gfnSteamAppIds,
    psStoreEntries,
    psStoreHasMore,
    psStoreNextOffset,
    psPlusAvailableOnly,
    psPlusStoreProductIds,
    loading,
  ]);

  // Match this provider's raw chart against this provider's own catalog,
  // keeping the chart's own rank so a filtered-out title still leaves a
  // visible gap rather than silently compacting the list.
  const rows = React.useMemo(
    (): StoreRow[] =>
      provider === 'xcloud'
        ? buildXboxStoreRows(xboxProductIds, xcloudByProductId, xboxPriceMap)
        : provider === 'gfn'
        ? buildGfnStoreRows(steamEntries, gfnFullCatalog)
        : buildPsStoreRows(psStoreEntries, psPlusGames),
    [
      provider,
      xboxProductIds,
      xcloudByProductId,
      xboxPriceMap,
      steamEntries,
      gfnFullCatalog,
      psStoreEntries,
      psPlusGames,
    ],
  );

  const visibleRows = React.useMemo(() => {
    let list = rows;
    if (saleOnly) {
      list = list.filter(row => !!row.originalPrice);
    }
    if (provider === 'gfn' && gfnAvailableOnly) {
      list = list.filter(row => !!row.catalogTitle);
    }
    if (provider === 'psstore' && psPlusAvailableOnly) {
      list = list.filter(row => !!row.catalogTitle);
    }
    return list;
  }, [rows, saleOnly, provider, gfnAvailableOnly, psPlusAvailableOnly]);

  // The initial page-0 fetch above only ever tries one page, and it's common
  // for that single page to match few or zero cloud-playable titles --
  // confirmed live that Steam's "New Releases" page 0 alone matches 0 of
  // GFN's much smaller catalog, and even "Top Sellers" only matches a
  // handful out of 100. Since a short match list can fit entirely on-screen
  // with nothing to scroll, its onEndReached (and with it, loadMore's own
  // keep-fetching loop) would otherwise never get a chance to run, silently
  // stranding the screen on whatever the first page happened to match even
  // though plenty more exist a few pages deeper. So: once the initial load
  // settles below MIN_VISIBLE_ROWS and more pages exist, kick loadMore
  // directly instead of waiting for a scroll gesture that may never come on
  // a list that's too short to need one. Gated on the relevant catalog
  // having loaded at least once, so this doesn't burn through pages while
  // xcloudTitles/gfnFullCatalog are still empty because *they* haven't
  // arrived yet (every row would look "no match" for that unrelated reason).
  // For GFN, only block auto-continuation on the catalog having loaded when
  // the "available only" filter is actually active -- with it off, rows are
  // already visible straight from Steam's own chart data regardless of
  // whether the (much smaller, sign-in-gated) GFN catalog has loaded yet.
  const catalogReady =
    provider === 'xcloud'
      ? xcloudTitles.length > 0
      : provider === 'gfn'
      ? !gfnAvailableOnly || gfnFullCatalog.length > 0
      : !psPlusAvailableOnly || psPlusGames.length > 0;
  React.useEffect(() => {
    if (
      loading ||
      loadingMore ||
      visibleRows.length >= MIN_VISIBLE_ROWS ||
      !catalogReady
    ) {
      return;
    }
    const hasMore =
      provider === 'xcloud'
        ? xboxHasMore
        : provider === 'gfn'
        ? steamHasMore
        : psStoreHasMore;
    if (!hasMore) {
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
    psStoreHasMore,
    loadMore,
  ]);

  const openRow = React.useCallback(
    (row: StoreRow) => {
      if (!row.catalogTitle) {
        return;
      }
      navigation.navigate('LibraryTitleDetail', {
        catalogTitle: row.catalogTitle,
      });
    },
    [navigation],
  );

  // One focused row id shared across the whole chart instead of a hook per
  // row -- renderRow is called per FlatList item, not fixed JSX, so a hook
  // can't be called inside it (see tvFocus.ts's own comment on useTVFocus).
  // Same focused-key pattern as LibraryView's renderCard.
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null);

  const renderRow = ({item}: {item: StoreRow}) => {
    // Only possible on the GFN/Steam or PS Store tab (see StoreRow's own
    // comment) -- still shown so the chart reads as the real, complete
    // ranking, just dimmed and inert since there's nothing to launch.
    const unavailable = !item.catalogTitle;
    const isFocused = focusedRowId === item.id;
    return (
      <Pressable
        style={[
          styles.row,
          unavailable && styles.rowUnavailable,
          isFocused && tvFocusRing,
        ]}
        disabled={unavailable}
        onPress={() => openRow(item)}
        onFocus={() => setFocusedRowId(item.id)}
        onBlur={() => setFocusedRowId(prev => (prev === item.id ? null : prev))}
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
              <Text
                style={[styles.price, !!item.originalPrice && styles.onSale]}>
                {item.price}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  // Each of these is written once in fixed JSX below (never mapped), so one
  // useTVFocus() call per element is fine -- no focused-key pattern needed.
  const xcloudTabFocus = useTVFocus();
  const gfnTabFocus = useTVFocus();
  const psstoreTabFocus = useTVFocus();
  const bestKindFocus = useTVFocus();
  const newKindFocus = useTVFocus();
  const saleKindFocus = useTVFocus();
  const gfnAvailableFocus = useTVFocus();
  const psPlusAvailableFocus = useTVFocus();

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
              xcloudTabFocus.focused && tvFocusRing,
            ]}
            onPress={() => setProvider('xcloud')}
            onFocus={xcloudTabFocus.onFocus}
            onBlur={xcloudTabFocus.onBlur}>
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
              gfnTabFocus.focused && tvFocusRing,
            ]}
            onPress={() => setProvider('gfn')}
            onFocus={gfnTabFocus.onFocus}
            onBlur={gfnTabFocus.onBlur}>
            <Text
              style={[styles.tabText, provider === 'gfn' && styles.tabTextOn]}>
              {t('StoreTabSteam')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              provider === 'psstore' && {
                backgroundColor: PS_ACCENT,
                borderColor: PS_ACCENT,
              },
              psstoreTabFocus.focused && tvFocusRing,
            ]}
            onPress={() => setProvider('psstore')}
            onFocus={psstoreTabFocus.onFocus}
            onBlur={psstoreTabFocus.onBlur}>
            <Text
              style={[
                styles.tabText,
                provider === 'psstore' && styles.tabTextOn,
              ]}>
              {t('StoreTabPsStore')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.kindRow}>
          <Pressable
            style={[
              styles.kindChip,
              chartKind === 'best' && styles.kindOn,
              bestKindFocus.focused && tvFocusRing,
            ]}
            onPress={() => setChartKind('best')}
            onFocus={bestKindFocus.onFocus}
            onBlur={bestKindFocus.onBlur}>
            <Text
              style={[
                styles.kindText,
                chartKind === 'best' && styles.kindTextOn,
              ]}>
              {t('StoreBestSellers')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.kindChip,
              chartKind === 'new' && styles.kindOn,
              newKindFocus.focused && tvFocusRing,
            ]}
            onPress={() => setChartKind('new')}
            onFocus={newKindFocus.onFocus}
            onBlur={newKindFocus.onBlur}>
            <Text
              style={[
                styles.kindText,
                chartKind === 'new' && styles.kindTextOn,
              ]}>
              {t('StoreNewReleases')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.kindChip,
              saleOnly && styles.kindOnSale,
              saleKindFocus.focused && tvFocusRing,
            ]}
            onPress={() => setSaleOnly(prev => !prev)}
            onFocus={saleKindFocus.onFocus}
            onBlur={saleKindFocus.onBlur}>
            <Text style={[styles.kindText, saleOnly && styles.kindTextOnSale]}>
              {t('LibraryFilterOnSale')}
            </Text>
          </Pressable>
          {provider === 'gfn' && (
            <Pressable
              style={[
                styles.kindChip,
                gfnAvailableOnly && styles.kindOnGfnAvailable,
                gfnAvailableFocus.focused && tvFocusRing,
              ]}
              onPress={() => setGfnAvailableOnly(prev => !prev)}
              onFocus={gfnAvailableFocus.onFocus}
              onBlur={gfnAvailableFocus.onBlur}>
              <Text
                style={[
                  styles.kindText,
                  gfnAvailableOnly && styles.kindTextOnGfnAvailable,
                ]}>
                {t('StoreFilterGfnAvailableOnly')}
              </Text>
            </Pressable>
          )}
          {provider === 'psstore' && (
            <Pressable
              style={[
                styles.kindChip,
                psPlusAvailableOnly && styles.kindOnPsPlusAvailable,
                psPlusAvailableFocus.focused && tvFocusRing,
              ]}
              onPress={() => setPsPlusAvailableOnly(prev => !prev)}
              onFocus={psPlusAvailableFocus.onFocus}
              onBlur={psPlusAvailableFocus.onBlur}>
              <Text
                style={[
                  styles.kindText,
                  psPlusAvailableOnly && styles.kindTextOnPsPlusAvailable,
                ]}>
                {t('StoreFilterPsPlusAvailableOnly')}
              </Text>
            </Pressable>
          )}
        </View>
        {(provider === 'xcloud' || gfnAvailableOnly || psPlusAvailableOnly) && (
          <Text style={styles.subnote}>{t('StoreFilteredNote')}</Text>
        )}
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
  kindOnGfnAvailable: {backgroundColor: NVIDIA_ACCENT},
  kindOnPsPlusAvailable: {backgroundColor: PS_ACCENT},
  kindText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  kindTextOn: {color: '#2B1D02'},
  kindTextOnSale: {color: '#2B1200'},
  kindTextOnGfnAvailable: {color: '#0B2B00'},
  kindTextOnPsPlusAvailable: {color: '#EAFFF0'},
  subnote: {fontSize: 11, color: '#5C6963'},
  list: {paddingHorizontal: 14, paddingBottom: 24},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  // Dims a Steam-only row (no GFN match, nothing to launch) so the chart
  // still reads as Steam's real, complete ranking instead of silently
  // dropping titles the way the Xbox tab's API constraints force it to.
  rowUnavailable: {opacity: 0.45},
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
