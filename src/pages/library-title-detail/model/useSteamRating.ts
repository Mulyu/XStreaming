import React from 'react';
import {CatalogTitle, StoreRating} from '../../../entities/catalog-title';
import {
  fetchSteamRating,
  steamLanguageFor,
} from '../../../features/store-charts';
import {getSettings} from '../../../shared/lib/settings';

// The Steam app id to look reviews up for: the first GFN store variant that
// is a Steam listing, else the id a Store row carried.
export const steamAppIdOf = (
  title: CatalogTitle | undefined,
): string | undefined =>
  title?.gfn?.variants.find(v => v.steamAppId)?.steamAppId ||
  title?.store?.refs.steam ||
  undefined;

// Steam's review verdict for a title that is on Steam (every GFN Steam
// variant is), shown beside the other stores' ratings. null while loading and
// when Steam has none.
export const useSteamRating = (
  title: CatalogTitle | undefined,
  cc: string,
): StoreRating | null => {
  const [rating, setRating] = React.useState<StoreRating | null>(null);
  const appId = steamAppIdOf(title);
  const name = title?.title ?? '';

  React.useEffect(() => {
    setRating(null);
    if (!appId) {
      return;
    }
    let cancelled = false;
    fetchSteamRating(
      appId,
      name,
      cc || 'US',
      steamLanguageFor(getSettings().locale),
    ).then(result => {
      if (!cancelled) {
        setRating(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId, name, cc]);

  return rating;
};
