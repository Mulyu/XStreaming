const mockGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {get: (...a: any[]) => mockGet(...a)},
}));
const store: Record<string, string> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => store[k],
    set: (k: string, v: string) => {
      store[k] = v;
    },
  },
}));

import {fetchSteamRating, steamLanguageFor} from '../steamCharts';

const row = (appId: string, title: string, tooltip: string, cls = 'positive') =>
  `<a href="https://store.steampowered.com/app/${appId}/x/?snr=1" data-ds-appid="${appId}">` +
  `<span class="title">${title}</span>` +
  `<span class="search_review_summary ${cls}" data-tooltip-html="${tooltip}"></span></a>`;

describe('fetchSteamRating', () => {
  beforeEach(() => {
    mockGet.mockReset();
    Object.keys(store).forEach(k => delete store[k]);
  });

  it('takes the verdict off the result with the same app id', async () => {
    mockGet.mockResolvedValue({
      data: {
        results_html:
          row('1', 'Other', 'Mixed&lt;br&gt;100 reviews 50%', 'mixed') +
          row(
            '570',
            'Dota 2',
            '非常に好評&lt;br&gt;ユーザーレビュー6,721件中94%が好評です',
          ),
      },
    });
    const rating = await fetchSteamRating('570', 'Dota 2', 'JP', 'japanese');
    expect(rating).toMatchObject({
      kind: 'review',
      label: '非常に好評',
      sentiment: 'positive',
      percent: 94,
      count: 6721,
    });
    expect(mockGet.mock.calls[0][1].params).toMatchObject({
      term: 'Dota 2',
      cc: 'JP',
      l: 'japanese',
    });
  });

  it('answers a repeat from the cache', async () => {
    mockGet.mockResolvedValue({
      data: {
        results_html: row('570', 'Dota 2', 'Very Positive&lt;br&gt;1,000 94%'),
      },
    });
    await fetchSteamRating('570', 'Dota 2');
    await fetchSteamRating('570', 'Dota 2');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('is null when the search does not list the app, and when it fails', async () => {
    mockGet.mockResolvedValueOnce({
      data: {results_html: row('1', 'Other', 'Mixed&lt;br&gt;10 50%', 'mixed')},
    });
    expect(await fetchSteamRating('570', 'Dota 2')).toBeNull();
    mockGet.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchSteamRating('999', 'Nope')).toBeNull();
  });
});

describe('steamLanguageFor', () => {
  it('maps the app languages and defaults to English', () => {
    expect(steamLanguageFor('ja')).toBe('japanese');
    expect(steamLanguageFor('zht')).toBe('tchinese');
    expect(steamLanguageFor('xx')).toBe('english');
  });
});
