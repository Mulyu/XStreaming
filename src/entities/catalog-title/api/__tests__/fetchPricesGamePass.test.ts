jest.mock('react-native', () => {
  // Mutate the real module's NativeModules in place rather than spreading
  // react-native's own top-level exports: that spread would read (and so
  // eagerly evaluate) every lazy export, including iOS-only native-module
  // getters (e.g. Settings) that fail outside this project's own
  // Android-only jest.setup.js mocking.
  const RN = jest.requireActual('react-native');
  RN.NativeModules.CatalogDisplayModule = {fetchProducts: jest.fn()};
  return RN;
});

import {NativeModules} from 'react-native';
import {fetchPrices} from '../storePrice';

const mockFetchProducts = NativeModules.CatalogDisplayModule
  .fetchProducts as jest.Mock;

const sub = {
  DisplaySkuAvailabilities: [
    {
      Availabilities: [
        {
          LicensingData: {
            SatisfyingEntitlementKeys: [
              {
                EntitlementKeys: [
                  'xbx:Subscription:66bc4555-fa25-428f-baac-8c057955d892:Full',
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('fetchPrices gamePass', () => {
  it('collects the ids of Game Pass products, keyed in uppercase', async () => {
    mockFetchProducts.mockResolvedValue([
      {ProductId: '9npdn9r45jx4', ...sub},
      {ProductId: '9P8LR42PTRGJ', DisplaySkuAvailabilities: []},
    ]);
    const result = await fetchPrices(['9NPDN9R45JX4', '9P8LR42PTRGJ']);
    expect(result.ok).toBe(true);
    expect(result.gamePass).toEqual({'9NPDN9R45JX4': true});
  });

  it('returns an empty map when the request fails', async () => {
    mockFetchProducts.mockRejectedValue(new Error('network'));
    const result = await fetchPrices(['9NPDN9R45JX4']);
    expect(result.ok).toBe(false);
    expect(result.gamePass).toEqual({});
  });
});
