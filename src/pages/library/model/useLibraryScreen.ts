import React from 'react';
import {Platform, useWindowDimensions} from 'react-native';
import {useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import {isSignedIn, getValidGfnJwt} from '../../../entities/gfn-account';
import {
  GfnGame,
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  mergeOwnedGames,
  fetchGfnCatalogOrder,
  GFN_SORT_MOST_POPULAR,
  GFN_SORT_LAST_ADDED,
  fetchGfnFullCatalog,
  getFreshFullCatalog,
  getCachedFullCatalog,
  buildUnifiedCatalog,
  isCatalogTitleOwned,
  CatalogTitle,
  getCatalogPreference,
  getFavoriteKeys,
  getPlayHistory,
  getXcloudData,
  saveXcloudData,
  getFreshPriceCache,
  savePriceCache,
  getFreshPopularOrder,
  savePopularOrder,
  getFreshGfnRankOrder,
  saveGfnRankOrder,
  getFreshSteamPriceCache,
  saveSteamPriceCache,
  XcloudCatalogApi,
  loadXcloudCatalog,
  fetchPopularOrder,
  buildPopularRank,
  PriceInfo,
  deriveMarketLanguage,
  fetchPricesWithRetry,
  getPrice,
  isSaleForDisplay,
  discountPercent,
  SteamPriceInfo,
  fetchSteamPrices,
  isSteamSaleForDisplay,
} from '../../../entities/catalog-title';
import {
  launchWithProvider,
  isPreferenceAvailable,
} from '../../../features/launch-title';
import {
  isPsPlusSignedIn,
  getNpsso,
  fetchUnifiedCatalog,
  CloudGame,
  getCachedCatalogGames,
  saveCatalogGames,
} from '../../../features/ps-plus-session';
import {getSettings} from '../../../shared/lib/settings';
import {getSystemRegion} from '../../../shared/lib/locale';

export type SortMode = 'reco' | 'newest' | 'popular' | 'recent';

const EMPTY_PRICE_MAP: Record<string, PriceInfo> = {};
const EMPTY_RANK: Record<string, number> = {};

// The single "Library" tab: xCloud and GeForce NOW titles merged by name into
// one grid. A title with entries on both services still gets one card; which
// provider (and, for GFN, which linked store) to actually play it on is
// decided on the title's own detail screen, not here.
export function useLibraryScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  // Cached instant-paint like the GFN lists below -- this had no synchronous
  // cache at all before, so the grid stayed empty until the network round
  // trip finished on every single launch, not just the first one.
  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>(
    () => getXcloudData()?.titles || [],
  );
  // The full, authenticated GFN browse catalog -- the ONLY source this
  // screen reads GFN's catalog membership from (see fetchGfnFullCatalog's
  // own comment for why the small public JSON snapshot is no longer
  // consulted as a fallback: live-verified it omits entire franchises).
  // Empty while signed out or before the first successful load, in which
  // case the GFN side of the Library is simply empty rather than showing
  // stale/incomplete data.
  const [gfnFullCatalog, setGfnFullCatalog] = React.useState<GfnGame[]>(
    () => getCachedFullCatalog() || [],
  );
  // True only while the full catalog fetch below is actually in flight (a
  // fresh cache hit resolves synchronously, so it never flips this) -- drives
  // the small spinner next to the header's title count.
  const [gfnFullCatalogLoading, setGfnFullCatalogLoading] =
    React.useState(false);
  const [gfnOwnedGames, setGfnOwnedGames] = React.useState<GfnGame[]>(
    () => getFreshOwnedGames() || [],
  );
  // PS Plus's cloud-streaming (pscloud) catalog -- the same scope
  // pages/ps-plus-library shows, and for the same reason (that's Sony's own
  // "PS5 Game Cloud Streaming" catalog, not the separate/less-reliable PS
  // Now side -- see that screen's own model comment). The native fetch
  // disk-caches this for 24h too, but that's still a JNI round trip the JS
  // side has to await on every single mount -- unlike xCloud/GFN above,
  // which read a synchronous JS-side cache first. This instant-paints from
  // that same kind of cache (features/ps-plus-session's own
  // getCachedCatalogGames) instead of starting empty every time.
  const [psPlusGames, setPsPlusGames] = React.useState<CloudGame[]>(
    () => getCachedCatalogGames() || [],
  );
  const [keyword, setKeyword] = React.useState('');
  const [sortMode, setSortMode] = React.useState<SortMode>('recent');
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  // Which tile currently has D-pad/remote focus -- Android TV moves this via
  // standard View focus as the user navigates with the remote, but nothing
  // rendered that fact until now, so a tile focused by the remote looked
  // identical to every other tile.
  const [focusedKey, setFocusedKey] = React.useState<string | null>(null);

  // xCloud-only enrichment for the sale badge and the Sale/Newest/Popular
  // sorts -- GFN has no equivalent price, release-date or popularity data on
  // the public catalog path this screen reads (see the Library mock's own
  // notes), so these stay empty for GFN titles rather than faking a value.
  const [priceMap, setPriceMap] =
    React.useState<Record<string, PriceInfo>>(EMPTY_PRICE_MAP);
  // GFN's linked Steam store variants, for the sale badge/filter -- GFN's own
  // catalog has no price data of its own, but a title backed by Steam can
  // still be on sale there, same as an xCloud title can be on Game Pass.
  const [steamPriceMap, setSteamPriceMap] = React.useState<
    Record<string, SteamPriceInfo>
  >({});
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

  // Filter chips: provider (OR between active ones; neither active = all)
  // plus Favorite/Owned/On Sale, each an independent AND filter. Owned
  // defaults on; the rest default off.
  const [filterXcloud, setFilterXcloud] = React.useState(false);
  const [filterGfn, setFilterGfn] = React.useState(false);
  const [filterPsPlus, setFilterPsPlus] = React.useState(false);
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
  // Local play-history timestamps for "Recently played" (see
  // entities/catalog-title/model/playHistory.ts) -- recorded on-device at
  // launch time instead of read from a provider API, since PS Plus has no
  // such API at all and xCloud/GFN's each only expose an ordinal position,
  // not an actual timestamp. Reloaded on focus for the same reason as
  // favorites: launching a title happens on a separate screen instance.
  const [playHistory, setPlayHistory] = React.useState<Record<string, number>>(
    () => getPlayHistory(),
  );
  useFocusEffect(
    React.useCallback(() => {
      setFavoriteKeys(new Set(getFavoriteKeys()));
      setPlayHistory(getPlayHistory());
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
  // Persists alongside the instant-paint cache read above so the next
  // launch doesn't have to wait on the network for this list either.
  const persistXcloudTitles = React.useCallback((titles: any[]) => {
    setXcloudTitles(titles);
    saveXcloudData({...getXcloudData(), titles});
  }, []);

  React.useEffect(() => {
    if (!streamingTokens?.xCloudToken) {
      return;
    }
    loadXcloudCatalog(streamingTokens.xCloudToken).then(({titles}) => {
      if (titles.length > 0) {
        persistXcloudTitles(titles);
      }
    });
  }, [streamingTokens?.xCloudToken, persistXcloudTitles]);

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
    const api = new XcloudCatalogApi('', '');
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

  // GFN: the signed-in user's owned library, merged onto the full catalog
  // below (mergeOwnedGames also appends any owned title the catalog fetch
  // itself missed).
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

  // GFN's full browse catalog -- every cataloged title, not just what's
  // owned. Needs a signed-in token like the rank orders below, so it simply
  // stays empty while signed out -- there is no fallback catalog to show
  // instead (see gfnFullCatalog's own comment above). Cached 24h since a full
  // paginated fetch is dozens of sequential requests, not one.
  const loadGfnFullCatalog = React.useCallback((force = false) => {
    if (!isSignedIn()) {
      return;
    }
    if (!force) {
      const fresh = getFreshFullCatalog();
      if (fresh) {
        setGfnFullCatalog(fresh);
        return;
      }
    }
    setGfnFullCatalogLoading(true);
    getValidGfnJwt().then(token => {
      if (!token) {
        setGfnFullCatalogLoading(false);
        return;
      }
      fetchGfnFullCatalog(token)
        .then(({games}) => games.length > 0 && setGfnFullCatalog(games))
        .catch(() => {})
        .finally(() => setGfnFullCatalogLoading(false));
    });
  }, []);

  React.useEffect(() => {
    loadGfnFullCatalog();
  }, [loadGfnFullCatalog]);

  // PS Plus's pscloud catalog. Needs a signed-in PSN account (npsso), same
  // "stays empty while signed out" precondition as GFN's full catalog above.
  const loadPsPlusGames = React.useCallback((force = false) => {
    if (!isPsPlusSignedIn()) {
      setPsPlusGames([]);
      return;
    }
    const npsso = getNpsso();
    if (!npsso) {
      return;
    }
    fetchUnifiedCatalog(npsso, undefined, force)
      .then(result => {
        const games = result.games.filter(
          g => g.streamServiceType === 'pscloud',
        );
        setPsPlusGames(games);
        saveCatalogGames(games);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadPsPlusGames();
  }, [loadPsPlusGames]);

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

  // Pull-to-refresh: re-runs the same fetches the mount-time effects above
  // do (xCloud entitlements/recent, GFN public+owned catalog, GFN rank
  // orders, favorites), bypassing the 24h price/popularity caches is
  // deliberately left alone -- this is about the list itself (new
  // purchases, newly-added GFN titles), not those slower-moving sources.
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const tasks: Promise<any>[] = [];

      if (streamingTokens?.xCloudToken) {
        tasks.push(
          loadXcloudCatalog(streamingTokens.xCloudToken).then(({titles}) => {
            if (titles.length > 0) {
              persistXcloudTitles(titles);
            }
          }),
        );
      }

      if (isSignedIn()) {
        tasks.push(
          getValidGfnJwt().then(token => {
            if (!token) {
              return;
            }
            return Promise.all([
              fetchGfnOwnedGames(token)
                .then(owned => owned.length > 0 && setGfnOwnedGames(owned))
                .catch(() => {}),
              fetchGfnCatalogOrder(token, GFN_SORT_MOST_POPULAR).then(order => {
                if (order.length > 0) {
                  saveGfnRankOrder('popular', order);
                  setGfnPopularRank(buildPopularRank(order));
                }
              }),
              fetchGfnCatalogOrder(token, GFN_SORT_LAST_ADDED).then(order => {
                if (order.length > 0) {
                  saveGfnRankOrder('newest', order);
                  setGfnNewestRank(buildPopularRank(order));
                }
              }),
            ]);
          }),
        );
        // Deliberately not in `tasks`: a full paginated re-fetch is dozens of
        // sequential requests, and the pull-to-refresh spinner shouldn't sit
        // there that long. It paints whenever it resolves, same as any other
        // background state update.
        loadGfnFullCatalog(true);
      }

      // Same reasoning as the GFN full catalog above -- not in `tasks`.
      loadPsPlusGames(true);

      setFavoriteKeys(new Set(getFavoriteKeys()));
      setPlayHistory(getPlayHistory());

      await Promise.all(tasks);
    } finally {
      setRefreshing(false);
    }
  }, [
    streamingTokens?.xCloudToken,
    loadGfnFullCatalog,
    loadPsPlusGames,
    persistXcloudTitles,
  ]);

  const gfnGames = React.useMemo(
    () => mergeOwnedGames(gfnFullCatalog, gfnOwnedGames),
    [gfnFullCatalog, gfnOwnedGames],
  );

  // Steam prices for GFN's Steam-linked store variants, batched and cached
  // (24h) the same way xCloud's own prices are above.
  const steamPriceSigRef = React.useRef('');
  React.useEffect(() => {
    // Owned titles first: the full GFN browse catalog is thousands of
    // Steam-linked ids now (see fetchGfnFullCatalog), and fetchSteamPrices
    // only processes a handful of chunks at a time (see its own concurrency
    // cap) -- fetched in catalog order, the sale badge on the titles someone
    // actually owns (the default "Owned" filter view) could sit behind
    // thousands of other titles' worth of requests before ever arriving.
    // A Set preserves insertion order and dedupes, so listing owned ids
    // first just reorders them to the front of the queue.
    const ownedSteamAppIds = gfnGames
      .filter(g => g.owned)
      .map(g => g.steamAppId)
      .filter((id): id is string => !!id);
    const allSteamAppIds = gfnGames
      .map(g => g.steamAppId)
      .filter((id): id is string => !!id);
    const steamAppIds = Array.from(
      new Set([...ownedSteamAppIds, ...allSteamAppIds]),
    );
    if (steamAppIds.length === 0) {
      return;
    }
    const cc = deviceRegion || 'US';
    const sig = `${cc}:${steamAppIds.length}`;
    if (steamPriceSigRef.current === sig) {
      return;
    }
    steamPriceSigRef.current = sig;

    const cache = getFreshSteamPriceCache(cc);
    if (cache) {
      setSteamPriceMap(cache.priceMap);
    }

    fetchSteamPrices(steamAppIds, cc).then(prices => {
      setSteamPriceMap(prev => {
        const merged = {...prev, ...prices};
        saveSteamPriceCache(merged, cc, sig);
        return merged;
      });
    });
  }, [gfnGames, deviceRegion]);

  // xCloud release dates, turned into an ordinal rank (0 = newest known
  // date) so they combine fairly with GFN's ordinal "last added" rank --
  // comparing a real timestamp against a catalog position wouldn't mean
  // anything, but comparing two positions does.
  const xcloudNewestRank = React.useMemo(() => {
    const now = Date.now();
    const withDates = xcloudTitles
      .map((item: any) => ({
        id: item.productId as string | undefined,
        ms: item.productId
          ? new Date(releaseDates[item.productId] || '').getTime()
          : NaN,
      }))
      // A future release date is bad catalog data, not an actual newest
      // title -- treat it the same as no date at all (excluded here, so it
      // falls back to last-place in mergedRankOf) rather than letting it
      // sort to the very top.
      .filter(x => x.id && Number.isFinite(x.ms) && x.ms <= now)
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
    () => buildUnifiedCatalog(xcloudTitles, gfnGames, psPlusGames),
    [xcloudTitles, gfnGames, psPlusGames],
  );

  // Discount percent for the sale badge/filter: the best of xCloud's own
  // price (Game Pass) and any of the title's GFN-linked Steam variants --
  // whichever is on sale, or the bigger discount if both are. 0 for anything
  // not on sale on either.
  const saleDiscount = React.useCallback(
    (item: CatalogTitle): number => {
      const productId = item.xcloud?.raw?.productId;
      const xcloudPrice = productId ? getPrice(priceMap, productId) : null;
      const xcloudDiscount =
        xcloudPrice && isSaleForDisplay(xcloudPrice)
          ? discountPercent(xcloudPrice)
          : 0;

      const steamDiscount = (item.gfn?.variants ?? []).reduce((best, v) => {
        const steamPrice = v.steamAppId ? steamPriceMap[v.steamAppId] : null;
        return isSteamSaleForDisplay(steamPrice)
          ? Math.max(best, steamPrice!.discountPercent)
          : best;
      }, 0);

      return Math.max(xcloudDiscount, steamDiscount);
    },
    [priceMap, steamPriceMap],
  );

  const providerOwnedFiltered = React.useMemo(() => {
    let list = catalog;
    if (filterXcloud || filterGfn || filterPsPlus) {
      list = list.filter(
        item =>
          (filterXcloud && item.xcloud) ||
          (filterGfn && item.gfn) ||
          (filterPsPlus && item.psplus),
      );
    }
    if (filterFavorite) {
      list = list.filter(item => favoriteKeys.has(item.key));
    }
    if (filterOwnedOnly) {
      // Plain "Owned" (no provider filter) means playable via any service --
      // isCatalogTitleOwned's OR-across-providers is right there. But
      // combined with a provider filter (e.g. "PS Plus" + "Owned"), the user
      // means "owned on that service", not "present under that service and
      // owned on some other one" -- the OR check let a PS Plus title merely
      // present in the catalog (not actually owned) pass as long as it
      // happened to be owned via xCloud/GFN. Mirrors ps-plus-library's own
      // filter, which checks only that service's isOwned.
      const providerFilterActive = filterXcloud || filterGfn || filterPsPlus;
      list = list.filter(item =>
        providerFilterActive
          ? (filterXcloud && !!item.xcloud?.hasEntitlement) ||
            (filterGfn && !!item.gfn?.variants.some(v => v.owned)) ||
            (filterPsPlus &&
              (!!item.psplus?.isOwned || !!item.psplus?.inPlusCatalog))
          : isCatalogTitleOwned(item),
      );
    }
    if (filterOnSale) {
      list = list.filter(item => saleDiscount(item) > 0);
    }
    return list;
  }, [
    catalog,
    filterXcloud,
    filterPsPlus,
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
      // Local play history, not a provider API -- see
      // entities/catalog-title/model/playHistory.ts. Keyed directly by the
      // unified catalog key, so it ranks xCloud/GFN/PS Plus titles alike
      // (unlike mergedRankOf's xCloud/GFN-only provider ranks above, PS
      // Plus never had an equivalent API to source one from). A title never
      // launched from this device sorts last.
      list.sort(
        (a, b) =>
          (playHistory[b.key] ?? 0) - (playHistory[a.key] ?? 0) ||
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
    playHistory,
  ]);

  // 'reco' was never an actual recommendation ranking -- it's just the
  // catalog's own unsorted order, which is alphabetical (publicGames.ts and
  // catalog.ts's mergeOwnedGames both sort by title before this screen ever
  // sees the list). Labeled for what it actually does instead of implying a
  // ranking that isn't there.
  const sortOptions: {value: SortMode; label: string; scope: string}[] = [
    {value: 'reco', label: t('SortByName'), scope: ''},
    {value: 'newest', label: t('SortNewest'), scope: ''},
    {value: 'popular', label: t('Popular'), scope: ''},
    {value: 'recent', label: t('SortRecent'), scope: ''},
  ];
  const activeSortLabel =
    sortOptions.find(o => o.value === sortMode)?.label || t('SortRecent');

  // Square-tile grid. A denser 110/150 target read as too small for
  // browsing comfortably (was 260/300 before that pass) -- back up to a
  // size that lands around 2 columns on a phone in portrait.
  //
  // TV gets its own (larger) target and a lower column cap: a TV screen's
  // dp width is much wider than a phone's, so the same per-column target
  // used for landscape phones/tablets would scale up toward 7-8 columns --
  // that many more simultaneously-visible *and* FlatList-windowed image
  // tiles, on hardware that's typically far weaker (CPU/RAM) than a modern
  // phone, is what makes the grid feel heavy on Google TV specifically.
  const isLandscape = screenWidth > screenHeight;
  const numColumns = React.useMemo(() => {
    const target = Platform.isTV ? 340 : isLandscape ? 260 : 190;
    const maxColumns = Platform.isTV ? 5 : 8;
    return Math.max(2, Math.min(maxColumns, Math.floor(screenWidth / target)));
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

  // Long-press always goes to the detail screen, bypassing the saved
  // provider preference -- the escape hatch for reconsidering/changing
  // which provider a tap on this title launches.
  const openTitleDetail = React.useCallback(
    (item: CatalogTitle) => {
      navigation.navigate('LibraryTitleDetail', {catalogTitle: item});
    },
    [navigation],
  );

  return {
    t,
    backgroundColor: theme.colors.background,
    catalog,
    filtered,
    sorted,
    keyword,
    setKeyword,
    sortMode,
    setSortMode,
    sortMenuOpen,
    setSortMenuOpen,
    filterXcloud,
    setFilterXcloud,
    filterGfn,
    setFilterGfn,
    filterPsPlus,
    setFilterPsPlus,
    filterFavorite,
    setFilterFavorite,
    filterOwnedOnly,
    setFilterOwnedOnly,
    filterOnSale,
    setFilterOnSale,
    focusedKey,
    setFocusedKey,
    gfnFullCatalogLoading,
    sortOptions,
    activeSortLabel,
    numColumns,
    refreshing,
    onRefresh,
    openTitle,
    openTitleDetail,
    saleDiscount,
  };
}

export type LibraryScreenViewModel = ReturnType<typeof useLibraryScreen>;
