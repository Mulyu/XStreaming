// Which providers the Library / Store list looks at. The provider chips narrow
// the list to titles on the chosen services; this makes everything else
// (sale badge and order, Newest / Popular ranks, the Catalog chip, the badges on
// a card) look at the same services, so picking Xbox never lets a PlayStation
// discount or rank decide anything.
import {
  CatalogTitle,
  isInGamePass,
  isInPsCatalog,
} from '../../../entities/catalog-title';
import {EMPTY_RANK_TABLE, SortTables} from './rankSort';

export type SaleProvider = 'xbox' | 'gfn' | 'ps';

export type ProviderScope = {xcloud: boolean; gfn: boolean; psplus: boolean};

// The chips that are on, or every provider when none is.
export const getProviderScope = (
  xcloud: boolean,
  gfn: boolean,
  psplus: boolean,
): ProviderScope => {
  const any = xcloud || gfn || psplus;
  return {xcloud: !any || xcloud, gfn: !any || gfn, psplus: !any || psplus};
};

// Only Game Pass and the PS catalog exist as catalogs; with just GeForce NOW
// looked at there is nothing for the Catalog chip to mean.
export const catalogAvailable = (scope: ProviderScope): boolean =>
  scope.xcloud || scope.psplus;

// In a catalog of a looked-at service.
export const inScopedCatalog = (
  item: CatalogTitle,
  scope: ProviderScope,
  gamePassMap: Record<string, true>,
): boolean =>
  (scope.xcloud && isInGamePass(item, gamePassMap)) ||
  (scope.psplus && isInPsCatalog(item));

// Ranks of a service that is not looked at count for nothing (an empty table
// ranks no title), so they cannot move a title in the Newest / Popular order.
export const scopeSortTables = (
  tables: SortTables,
  scope: ProviderScope,
): SortTables => ({
  xcloudPopular: scope.xcloud ? tables.xcloudPopular : EMPTY_RANK_TABLE,
  xcloudNewest: scope.xcloud ? tables.xcloudNewest : EMPTY_RANK_TABLE,
  gfnPopular: scope.gfn ? tables.gfnPopular : EMPTY_RANK_TABLE,
  gfnNewest: scope.gfn ? tables.gfnNewest : EMPTY_RANK_TABLE,
  psPopular: scope.psplus ? tables.psPopular : EMPTY_RANK_TABLE,
  psNewest: scope.psplus ? tables.psNewest : EMPTY_RANK_TABLE,
});

export type SaleCandidates = {
  xbox: number;
  gfn: number; // Steam's price, attached to the GeForce NOW side
  ps: number;
  snapshot: number; // a wishlisted title's saved price
  snapshotProvider: SaleProvider | null;
};

const SCOPE_KEY = {xbox: 'xcloud', gfn: 'gfn', ps: 'psplus'} as const;

// The biggest discount among the looked-at services, and which one it is from
// (the badge takes that service's colour). A saved price from a service that is
// not looked at is left out; one whose service is unknown stays in.
export const bestSale = (
  c: SaleCandidates,
  scope: ProviderScope,
): {percent: number; provider: SaleProvider | null} => {
  const snapshotInScope =
    c.snapshotProvider === null || scope[SCOPE_KEY[c.snapshotProvider]];
  const candidates: {percent: number; provider: SaleProvider | null}[] = [
    {percent: scope.xcloud ? c.xbox : 0, provider: 'xbox'},
    {percent: scope.gfn ? c.gfn : 0, provider: 'gfn'},
    {percent: scope.psplus ? c.ps : 0, provider: 'ps'},
    {
      percent: snapshotInScope ? c.snapshot : 0,
      provider: c.snapshotProvider,
    },
  ];
  return candidates.reduce((best, x) => (x.percent > best.percent ? x : best));
};
