import axios from 'axios';
import {extractCategory, fetchPrices, fetchProductBasics} from '../storePrice';
import {xboxGenreLabel, XBOX_GENRE_KEYS} from '../../model/storeRating';

jest.mock('axios');

const product = (id: string, category?: string, rating?: number) => ({
  ProductId: id,
  Properties: {Category: category},
  LocalizedProperties: [{ProductTitle: `Title ${id}`, Images: []}],
  MarketProperties: [
    {
      UsageData: rating
        ? [
            {
              AggregateTimeSpan: 'AllTime',
              AverageRating: rating,
              RatingCount: 120,
            },
          ]
        : [],
    },
  ],
});

describe('extractCategory', () => {
  it('reads the store genre', () => {
    expect(extractCategory(product('A', 'Shooter'))).toBe('Shooter');
    expect(extractCategory(product('A', ' Racing & flying '))).toBe(
      'Racing & flying',
    );
  });

  it('is nothing when the product has none', () => {
    expect(extractCategory(product('A'))).toBeUndefined();
    expect(extractCategory({})).toBeUndefined();
    expect(extractCategory(null)).toBeUndefined();
  });
});

describe('genres and ratings from the same catalog response', () => {
  beforeEach(() => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        Products: [product('9abc', 'Shooter', 4.2), product('9def', undefined)],
      },
    });
  });

  it('fetchPrices returns them keyed by upper-case id', async () => {
    const result = await fetchPrices(['9ABC', '9DEF']);
    expect(result.genres).toEqual({'9ABC': 'Shooter'});
    expect(result.ratings['9ABC']).toEqual({average: 4.2, count: 120});
  });

  it('fetchProductBasics returns them for titles outside the catalog', async () => {
    const result = await fetchProductBasics(['9ABC', '9DEF']);
    expect(result.genres).toEqual({'9ABC': 'Shooter'});
    expect(result.ratings['9ABC']?.average).toBe(4.2);
    expect(result.basics['9ABC'].title).toBe('Title 9abc');
  });

  it('are empty maps for no ids', async () => {
    const result = await fetchPrices([]);
    expect(result.genres).toEqual({});
  });
});

describe('xboxGenreLabel', () => {
  const t = (key: string) => `t:${key}`;

  it('translates a known genre and keeps an unknown one as the store wrote it', () => {
    expect(xboxGenreLabel('Racing & flying', t)).toBe(
      't:XboxGenreRacingFlying',
    );
    expect(xboxGenreLabel('Something new', t)).toBe('Something new');
  });

  it('has a distinct translation key for every genre', () => {
    const keys = Object.values(XBOX_GENRE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
