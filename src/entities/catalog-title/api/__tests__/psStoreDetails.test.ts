import axios from 'axios';
import {
  fetchPsScreenshots,
  fetchPsStarRating,
  fetchPsStoreBrief,
  parsePsSearchScreenshots,
  parsePsStarRating,
  parsePsStoreBrief,
} from '../psStoreDetails';

jest.mock('axios');
jest.mock('../psStoreLocale', () => ({getPsStoreLocale: () => 'ja-JP'}));
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {getString: () => undefined, set: jest.fn()},
}));

// Shapes copied from real responses of the store's persisted queries.
const briefData = {
  productRetrieve: {
    contentRating: {name: 'CERO_UNDER_REVIEW'},
    edition: {name: 'Standard Edition'},
    localizedGenres: [{value: 'RPG'}],
    starRating: {averageRating: 4.89},
  },
};
const ratingData = {
  productRetrieve: {
    starRating: {
      averageRating: 4.89,
      totalRatingsCount: 9,
      ratingsDistribution: [
        {rating: 4, percentageRaw: 11},
        {rating: 5, percentageRaw: 89},
        {rating: 3, percentageRaw: 0},
      ],
    },
  },
};
const searchData = {
  universalSearch: {
    results: [
      {
        id: 'JP0082-OTHER_00-EDITION',
        name: 'ファイナルファンタジー VII',
        media: [
          {role: 'SCREENSHOT', type: 'IMAGE', url: 'https://img/other.jpg'},
        ],
      },
      {
        id: 'JP0082-PPSA37329_00-0230363907481835',
        name: 'FINAL FANTASY VII REVELATION',
        media: [
          {role: 'PREVIEW', type: 'VIDEO', url: 'https://vid/a.mp4'},
          {role: 'SCREENSHOT', type: 'IMAGE', url: 'https://img/1.jpg'},
          {role: 'SCREENSHOT', type: 'IMAGE', url: 'https://img/2.jpg'},
          {role: 'LOGO', type: 'IMAGE', url: 'https://img/logo.png'},
        ],
      },
    ],
  },
};

describe('parsePsStoreBrief', () => {
  it('reads genres, age rating, edition and the average', () => {
    expect(parsePsStoreBrief(briefData)).toEqual({
      genres: ['RPG'],
      contentRating: 'CERO_UNDER_REVIEW',
      edition: 'Standard Edition',
      averageRating: 4.89,
    });
  });

  it('reads a concept answer through its default product', () => {
    const brief = parsePsStoreBrief({
      conceptRetrieve: {defaultProduct: briefData.productRetrieve},
    });
    expect(brief?.genres).toEqual(['RPG']);
  });

  it('copes with nothing known', () => {
    expect(parsePsStoreBrief(null)).toBeNull();
    expect(
      parsePsStoreBrief({
        productRetrieve: {localizedGenres: null, starRating: null},
      }),
    ).toEqual({
      genres: [],
      contentRating: undefined,
      edition: undefined,
      averageRating: undefined,
    });
  });
});

describe('parsePsStarRating', () => {
  it('reads average, count and the distribution, five stars first', () => {
    const rating = parsePsStarRating(ratingData);
    expect(rating?.average).toBe(4.89);
    expect(rating?.count).toBe(9);
    expect(rating?.distribution.map(d => d.stars)).toEqual([5, 4, 3]);
    expect(rating?.distribution[0].percent).toBe(89);
  });

  it('is null when nobody has rated it', () => {
    expect(
      parsePsStarRating({
        productRetrieve: {starRating: {averageRating: 0, totalRatingsCount: 0}},
      }),
    ).toBeNull();
    expect(parsePsStarRating({productRetrieve: {starRating: null}})).toBeNull();
  });
});

describe('parsePsSearchScreenshots', () => {
  it('takes the screenshots of the result with the same product id', () => {
    expect(
      parsePsSearchScreenshots(searchData, {
        title: 'something else',
        productId: 'JP0082-PPSA37329_00-0230363907481835',
      }),
    ).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
  });

  it('falls back to the same name', () => {
    expect(
      parsePsSearchScreenshots(searchData, {
        title: 'FINAL FANTASY VII Revelation',
      }),
    ).toHaveLength(2);
  });

  it('gives nothing when no result is this title', () => {
    expect(parsePsSearchScreenshots(searchData, {title: 'Astro Bot'})).toEqual(
      [],
    );
    expect(parsePsSearchScreenshots(null, {title: 'x'})).toEqual([]);
  });
});

describe('fetching', () => {
  const get = axios.get as jest.Mock;
  beforeEach(() => get.mockReset());

  it('asks the product query for a product id and the concept query for a concept id', async () => {
    get.mockResolvedValue({data: {data: briefData}});
    await fetchPsStoreBrief({productId: 'P1'});
    await fetchPsStoreBrief({conceptId: '10018084'});
    const [product, concept] = get.mock.calls.map(c => c[1].params);
    expect(product.operationName).toBe('queryRetrieveTelemetryDataPDPProduct');
    expect(JSON.parse(product.variables)).toEqual({productId: 'P1'});
    expect(concept.operationName).toBe('queryRetrieveTelemetryDataPDPConcept');
    expect(JSON.parse(concept.variables)).toEqual({conceptId: '10018084'});
    expect(
      JSON.parse(product.extensions).persistedQuery.sha256Hash,
    ).toHaveLength(64);
    expect(get.mock.calls[0][1].headers['x-apollo-operation-name']).toBe(
      'queryRetrieveTelemetryDataPDPProduct',
    );
  });

  it('returns null / empty on a failed request, or without an id', async () => {
    get.mockRejectedValue(new Error('net'));
    expect(await fetchPsStarRating({productId: 'P1'})).toBeNull();
    expect(await fetchPsScreenshots({title: 'x'})).toEqual([]);
    expect(await fetchPsStoreBrief({})).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('searches in the store locale', async () => {
    get.mockResolvedValue({data: {data: searchData}});
    const shots = await fetchPsScreenshots({
      title: 'FINAL FANTASY VII REVELATION',
      productId: 'JP0082-PPSA37329_00-0230363907481835',
    });
    expect(shots).toHaveLength(2);
    const vars = JSON.parse(get.mock.calls[0][1].params.variables);
    expect(vars).toMatchObject({
      countryCode: 'JP',
      languageCode: 'ja',
      searchTerm: 'FINAL FANTASY VII REVELATION',
    });
  });
});
