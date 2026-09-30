import React from 'react';
import {useTranslation} from 'react-i18next';
import {
  fetchUnifiedCatalog,
  getNpsso,
  isPsPlusSignedIn,
  clearNpsso,
  CloudGame,
  getCachedCatalogGames,
  saveCatalogGames,
  clearCatalogGames,
} from '../../../features/ps-plus-session';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('PsPlusLibraryScreen');

export type PsPlusPlatformFilter = 'ps5' | 'ps4' | 'ps3';

export function usePsPlusLibrary(navigation: any) {
  const {t} = useTranslation();
  const [signedIn, setSignedIn] = React.useState(isPsPlusSignedIn());
  // Instant-paints from the same JS-side cache the main Library screen uses
  // (features/ps-plus-session's getCachedCatalogGames), rather than starting
  // empty and waiting on the native fetch's own round trip every time this
  // screen is opened.
  const [games, setGames] = React.useState<CloudGame[]>(
    () => getCachedCatalogGames() || [],
  );
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  // Owned-only defaults on (this screen used to hard-filter to owned +
  // "streamable" before this could be toggled at all), but is now a plain
  // switch over the pscloud catalog fetched below, same "Owned" filter
  // convention as the main Library screen's own filterOwnedOnly.
  const [filterOwnedOnly, setFilterOwnedOnly] = React.useState(true);
  const [platformFilters, setPlatformFilters] = React.useState<
    Set<PsPlusPlatformFilter>
  >(new Set());

  const load = React.useCallback(
    async (opts?: {isRefresh?: boolean; forceRefresh?: boolean}) => {
      const npsso = getNpsso();
      if (!npsso) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      setError('');
      if (opts?.isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const result = await fetchUnifiedCatalog(
          npsso,
          undefined,
          !!opts?.forceRefresh,
        );
        // Sony's own "PS5 Game Cloud Streaming" page
        // (playstation.com/*/ps5-game-cloud-streaming/) is powered by exactly
        // this same imagic gameslist API, gating each PS5 title by its own
        // streamingSupported flag -- confirmed live (all-ps5-list returns the
        // FULL PS5 store catalog, most titles with streamingSupported:false).
        // That's exactly what streamServiceType=="pscloud" already encodes
        // here (see category_for/stream_service_type in cloudcatalog_merge.c).
        // The "psnow" (PS3/PS4 "PS Now") side is a separate Sony offering that
        // page doesn't cover at all, and -- unlike pscloud -- carries no
        // per-title eligibility signal of its own (every row returned by the
        // Kamaji/APOLLOROOT catalog is unconditionally badged "streamable");
        // that's almost certainly the "remote-play-flavored, not actually
        // cloud-play" titles seen in this list before. So this screen is now
        // scoped to the pscloud (PS5) catalog only, ownership handled as its
        // own toggle below rather than a hard filter -- this endpoint is
        // Sony's whole PS5 store, not just what's streamable, so showing the
        // full catalog here (not just owned) is what makes a "which games can
        // I cloud-stream" browser actually useful.
        const pscloudGames = result.games.filter(
          g => g.streamServiceType === 'pscloud',
        );
        setGames(pscloudGames);
        saveCatalogGames(pscloudGames);
        if (result.warning) {
          log.warn('Catalog warning:', result.warning);
        }
      } catch (e: any) {
        log.warn('Catalog fetch failed:', e);
        setError(e?.message ? String(e.message) : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void load();
    });
    void load();
    return unsubscribe;
  }, [navigation, load]);

  const onRefresh = React.useCallback(() => {
    void load({isRefresh: true, forceRefresh: true});
  }, [load]);

  const onSignIn = React.useCallback(() => {
    navigation.navigate('PsPlusLogin');
  }, [navigation]);

  const onSignOut = React.useCallback(() => {
    clearNpsso();
    clearCatalogGames();
    setSignedIn(false);
    setGames([]);
  }, []);

  const onSelectGame = React.useCallback(
    (game: CloudGame) => {
      navigation.navigate('PsPlusStream', {
        productId: game.productId,
        name: game.name,
        serviceType: game.streamServiceType === 'psnow' ? 'psnow' : 'pscloud',
        streamIdentifier: game.streamIdentifier,
        platform: game.platform,
        isOwned: game.isOwned,
        entitlementId: game.entitlementId,
      });
    },
    [navigation],
  );

  const togglePlatformFilter = React.useCallback(
    (platform: PsPlusPlatformFilter) => {
      setPlatformFilters(prev => {
        const next = new Set(prev);
        if (next.has(platform)) {
          next.delete(platform);
        } else {
          next.add(platform);
        }
        return next;
      });
    },
    [],
  );

  const filteredGames = React.useMemo(() => {
    let list = games;
    if (filterOwnedOnly) {
      list = list.filter(g => g.isOwned);
    }
    if (platformFilters.size > 0) {
      list = list.filter(g =>
        platformFilters.has(g.platform as PsPlusPlatformFilter),
      );
    }
    const q = keyword.trim().toLowerCase();
    if (q) {
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [games, filterOwnedOnly, platformFilters, keyword]);

  return {
    t,
    signedIn,
    games: filteredGames,
    totalCount: games.length,
    loading,
    refreshing,
    error,
    keyword,
    setKeyword,
    filterOwnedOnly,
    setFilterOwnedOnly: () => setFilterOwnedOnly(v => !v),
    platformFilters,
    togglePlatformFilter,
    onRefresh,
    onSignIn,
    onSignOut,
    onSelectGame,
  };
}

export type PsPlusLibraryViewModel = ReturnType<typeof usePsPlusLibrary>;
