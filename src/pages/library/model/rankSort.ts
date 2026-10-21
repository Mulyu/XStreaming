// Ordering for the Library's Newest / Popular sorts. Every provider supplies
// its own ordered list (xCloud's popular collection and release dates, GFN's
// sort definitions, the PS Store's top-sellers / newest categories). A bare
// position is meaningless across lists of very different lengths, so each
// position is turned into "how far down its own list" (0 = top) and titles
// are compared on that.
import {CatalogTitle, normalizeTitle} from '../../../entities/catalog-title';

export type RankTable = {
  /** key -> 0-based position in the provider's own ordered list */
  rank: Record<string, number>;
  /** length of the list the positions are a prefix of */
  total: number;
};

export const EMPTY_RANK_TABLE: RankTable = {rank: {}, total: 0};

export const makeRankTable = (
  rank: Record<string, number>,
  total?: number,
): RankTable => {
  if (total !== undefined) {
    return {rank, total};
  }
  let max = -1;
  Object.keys(rank).forEach(k => {
    if (rank[k] > max) {
      max = rank[k];
    }
  });
  return {rank, total: max + 1};
};

const fraction = (table: RankTable, key: string): number | undefined => {
  const position = table.rank[key];
  if (position === undefined || table.total <= 0) {
    return undefined;
  }
  return position / Math.max(table.total, position + 1);
};

const best = (values: (number | undefined)[]): number | undefined => {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length > 0 ? Math.min(...present) : undefined;
};

export const UNRANKED = Number.MAX_SAFE_INTEGER;

// Key under which a PS title is looked up by its (normalized) name, for
// titles whose product ids differ from the PS Store category's.
export const psNameKey = (name: string): string => `n:${normalizeTitle(name)}`;

// Turns the PS Store's ordered entries into a RankTable keyed by product id
// and by normalized name (first, i.e. best, occurrence wins -- the category
// lists each edition separately).
export const buildPsRankTable = (
  entries: {productId: string; title: string}[],
  totalCount?: number,
): RankTable => {
  const rank: Record<string, number> = {};
  entries.forEach((e, i) => {
    if (rank[e.productId] === undefined) {
      rank[e.productId] = i;
    }
    const nameKey = psNameKey(e.title);
    if (rank[nameKey] === undefined) {
      rank[nameKey] = i;
    }
  });
  return makeRankTable(rank, totalCount ?? entries.length);
};

const psKeys = (item: CatalogTitle): string[] => {
  const raw = item.psplus?.raw;
  if (!raw) {
    return [];
  }
  const keys: string[] = [];
  if (raw.productId) {
    keys.push(raw.productId);
  }
  if (raw.storeProductId) {
    keys.push(raw.storeProductId);
  }
  keys.push(psNameKey(raw.name || item.title));
  return keys;
};

export type SortTables = {
  xcloudPopular: RankTable;
  xcloudNewest: RankTable;
  gfnPopular: RankTable;
  gfnNewest: RankTable;
  psPopular: RankTable;
  psNewest: RankTable;
};

const xcloudFraction = (
  item: CatalogTitle,
  table: RankTable,
  upperKey: boolean,
): number | undefined => {
  const id = item.xcloud?.raw?.productId;
  return id ? fraction(table, upperKey ? id.toUpperCase() : id) : undefined;
};

const gfnFraction = (
  item: CatalogTitle,
  table: RankTable,
): number | undefined =>
  best((item.gfn?.variants ?? []).map(v => fraction(table, v.id)));

const psFraction = (item: CatalogTitle, table: RankTable): number | undefined =>
  best(psKeys(item).map(k => fraction(table, k)));

// Popular: the best standing the title has on any provider.
export const popularityScore = (item: CatalogTitle, t: SortTables): number =>
  best([
    xcloudFraction(item, t.xcloudPopular, true),
    gfnFraction(item, t.gfnPopular),
    psFraction(item, t.psPopular),
  ]) ?? UNRANKED;

// Newest: xCloud's and the PS Store's lists are ordered by release date, but
// GFN's is ordered by when the title was *added to GFN* -- a different thing
// -- so GFN is only consulted for titles neither of the other two ranks.
export const newestScore = (item: CatalogTitle, t: SortTables): number =>
  best([
    xcloudFraction(item, t.xcloudNewest, false),
    psFraction(item, t.psNewest),
  ]) ??
  gfnFraction(item, t.gfnNewest) ??
  UNRANKED;
