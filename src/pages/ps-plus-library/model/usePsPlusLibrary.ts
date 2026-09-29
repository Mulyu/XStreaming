import React from 'react';
import {useTranslation} from 'react-i18next';
import {
  fetchUnifiedCatalog,
  getNpsso,
  isPsPlusSignedIn,
  clearNpsso,
  CloudCategory,
  CloudGame,
} from '../../../features/ps-plus-session';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('PsPlusLibraryScreen');

export function usePsPlusLibrary(navigation: any) {
  const {t} = useTranslation();
  const [signedIn, setSignedIn] = React.useState(isPsPlusSignedIn());
  const [games, setGames] = React.useState<CloudGame[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');

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
        // "purchaseable" PS5 titles are the store's full browse catalog minus
        // what this account can actually play -- streaming one would just
        // fail with no PS Plus entitlement to back it. This screen is the
        // cloud-streaming library (see PsPlusBrowseLibraryDesc), not a store,
        // so only show what's actually streamable right now: games already
        // owned, plus the PS Now (psnow) subscription titles that stream
        // without ownership.
        setGames(
          result.games.filter(
            g =>
              g.category === CloudCategory.OWNED ||
              g.category === CloudCategory.STREAMABLE,
          ),
        );
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

  return {
    t,
    signedIn,
    games,
    loading,
    refreshing,
    error,
    onRefresh,
    onSignIn,
    onSignOut,
    onSelectGame,
  };
}

export type PsPlusLibraryViewModel = ReturnType<typeof usePsPlusLibrary>;
