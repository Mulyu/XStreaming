import axios from 'axios';
import {debugFactory} from '../../../shared/lib/debug';
import {getPsStoreLocale} from './psStoreLocale';
import {PS_GRAPHQL_URL} from './psStoreGrid';
import {normalizeTitle} from './gfnCatalog';

const log = debugFactory('psStoreDetails');

// What the PlayStation Store's own web client asks its GraphQL API for on a
// product page, as persisted queries. Their ids are the web client's, captured
// from a real browser session (the page's request log) -- stable until Sony
// changes a query, at which point the call returns nothing and the caller
// simply leaves that field out (same risk as psStorePrice.ts's pricing query).
// The description, publisher and release date are not among them: the web
// client only gets those from the server-rendered page, so they have no
// equivalent here.
const OPS = {
  productBrief: {
    name: 'queryRetrieveTelemetryDataPDPProduct',
    hash: '71375f8f3dba0de83520ecd474069e037f8ea23b4efcb6778aef58894cd4452d',
  },
  conceptBrief: {
    name: 'queryRetrieveTelemetryDataPDPConcept',
    hash: '906eef4a71644e7c6c9c7b300b68754e385f01149240c1767bbca493c5d92485',
  },
  productRating: {
    name: 'wcaProductStarRatingRetrive',
    hash: '799fa113378f699281e0eda3154c54e03d763f6a98ad9a1378d58b1c2cb76cec',
  },
  conceptRating: {
    name: 'wcaConceptStarRatingRetrive',
    hash: '6c476325b232d51aca55ce143d6f946860e22174a263967fbb9e1da4f78489fa',
  },
  search: {
    name: 'getSearchResults',
    hash: '4df6284f982e57bec70f23c77e2c219dc792eb19af7fb3d3a81767aa3f1958aa',
  },
};

type Op = {name: string; hash: string};

export type PsId = {productId?: string; conceptId?: string};

export type PsStoreBrief = {
  genres: string[];
  // e.g. "CERO_UNDER_REVIEW", "ESRB_M"
  contentRating?: string;
  edition?: string;
  // The average only; the count comes from fetchPsStarRating.
  averageRating?: number;
};

export type PsStarRating = {
  average: number;
  count: number;
  // Share of the ratings at each star level (5 first), in percent.
  distribution: {stars: number; percent: number}[];
};

const callOp = async (
  op: Op,
  variables: Record<string, unknown>,
): Promise<any | null> => {
  try {
    const res = await axios.get(PS_GRAPHQL_URL, {
      params: {
        operationName: op.name,
        variables: JSON.stringify(variables),
        extensions: JSON.stringify({
          persistedQuery: {version: 1, sha256Hash: op.hash},
        }),
      },
      headers: {
        Accept: 'application/json',
        'x-psn-store-locale-override': getPsStoreLocale(),
        // An unauthenticated GraphQL GET without this (or a non-form
        // content-type) is rejected as a possible CSRF attempt.
        'x-apollo-operation-name': op.name,
      },
      timeout: 15000,
    });
    return res?.data?.data ?? null;
  } catch (e) {
    log.info(`${op.name} failed:`, e);
    return null;
  }
};

const productOf = (data: any): any =>
  data?.productRetrieve ?? data?.conceptRetrieve?.defaultProduct ?? null;

export const parsePsStoreBrief = (data: any): PsStoreBrief | null => {
  const product = productOf(data);
  if (!product) {
    return null;
  }
  const genres: string[] = Array.isArray(product.localizedGenres)
    ? product.localizedGenres
        .map((g: any) => g?.value)
        .filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : [];
  const average = product.starRating?.averageRating;
  return {
    genres,
    contentRating: product.contentRating?.name || undefined,
    edition: product.edition?.name || undefined,
    averageRating:
      typeof average === 'number' && average > 0 ? average : undefined,
  };
};

export const parsePsStarRating = (data: any): PsStarRating | null => {
  const rating = productOf(data)?.starRating;
  const average = rating?.averageRating;
  const count = rating?.totalRatingsCount;
  if (typeof average !== 'number' || !(average > 0) || !(count > 0)) {
    return null;
  }
  const distribution: PsStarRating['distribution'] = Array.isArray(
    rating.ratingsDistribution,
  )
    ? rating.ratingsDistribution
        .map((d: any) => ({
          stars: Number(d?.rating),
          percent: Number(d?.percentageRaw),
        }))
        .filter(
          (d: {stars: number; percent: number}) =>
            Number.isFinite(d.stars) && Number.isFinite(d.percent),
        )
        .sort((a: {stars: number}, b: {stars: number}) => b.stars - a.stars)
    : [];
  return {average, count, distribution};
};

// The screenshots of the search result that is this title: the same product id
// when the result carries it, otherwise the same normalized name.
export const parsePsSearchScreenshots = (
  data: any,
  match: {title: string; productId?: string},
): string[] => {
  const results: any[] = data?.universalSearch?.results ?? [];
  const wanted = normalizeTitle(match.title);
  const hit =
    results.find(r => match.productId && r?.id === match.productId) ??
    results.find(r => r?.name && normalizeTitle(r.name) === wanted);
  const media: any[] = Array.isArray(hit?.media) ? hit.media : [];
  return media
    .filter(m => m?.role === 'SCREENSHOT' && m?.type === 'IMAGE' && m?.url)
    .map(m => m.url as string);
};

// "ja-JP" -> {countryCode: 'JP', languageCode: 'ja'}.
const searchLocale = (): {countryCode: string; languageCode: string} => {
  const parts = getPsStoreLocale().split('-');
  return {
    languageCode: parts[0].toLowerCase(),
    countryCode: parts[parts.length - 1].toUpperCase(),
  };
};

const idVariables = (id: PsId): Record<string, string> =>
  id.productId ? {productId: id.productId} : {conceptId: id.conceptId ?? ''};

const hasId = (id: PsId): boolean => !!(id.productId || id.conceptId);

// Genres, age rating and edition of a product (or a concept's default
// product). null when the request fails or the id is unknown.
export const fetchPsStoreBrief = async (
  id: PsId,
): Promise<PsStoreBrief | null> => {
  if (!hasId(id)) {
    return null;
  }
  const data = await callOp(
    id.productId ? OPS.productBrief : OPS.conceptBrief,
    idVariables(id),
  );
  return parsePsStoreBrief(data);
};

// Average, count and star distribution. null when nobody has rated it yet.
export const fetchPsStarRating = async (
  id: PsId,
): Promise<PsStarRating | null> => {
  if (!hasId(id)) {
    return null;
  }
  const data = await callOp(
    id.productId ? OPS.productRating : OPS.conceptRating,
    idVariables(id),
  );
  return parsePsStarRating(data);
};

// Screenshots found by searching the store for the title (up to ten per
// product). Empty when the search does not turn up the same product.
export const fetchPsScreenshots = async (match: {
  title: string;
  productId?: string;
}): Promise<string[]> => {
  const title = match.title.trim();
  if (!title) {
    return [];
  }
  const data = await callOp(OPS.search, {
    ...searchLocale(),
    nextCursor: '',
    pageOffset: 0,
    pageSize: 24,
    searchTerm: title,
  });
  return parsePsSearchScreenshots(data, match);
};
