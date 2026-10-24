import type {CatalogTitle} from './unifiedCatalog';

// Whether an xCloud title is included with Game Pass, from the store-id set
// the price fetch collects (see extractInGamePass). False for titles that are
// not on xCloud or not covered by the fetch (yet).
export const isInGamePass = (
  item: CatalogTitle,
  gamePassMap: Record<string, true>,
): boolean => {
  const id = item.xcloud?.raw?.productId;
  return !!id && gamePassMap[String(id).toUpperCase()] === true;
};

// The PS Plus counterpart, for the "free to play" filter: in the signed-in
// account's PS Plus catalog.
export const isInPsCatalog = (item: CatalogTitle): boolean =>
  !!item.psplus?.inPlusCatalog;
