import axios from 'axios';
import {fetchPrices} from '../storePrice';

jest.mock('axios');

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
    (axios.get as jest.Mock).mockResolvedValue({
      data: {
        Products: [
          {ProductId: '9npdn9r45jx4', ...sub},
          {ProductId: '9P8LR42PTRGJ', DisplaySkuAvailabilities: []},
        ],
      },
    });
    const result = await fetchPrices(['9NPDN9R45JX4', '9P8LR42PTRGJ']);
    expect(result.ok).toBe(true);
    expect(result.gamePass).toEqual({'9NPDN9R45JX4': true});
  });

  it('returns an empty map when the request fails', async () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('network'));
    const result = await fetchPrices(['9NPDN9R45JX4']);
    expect(result.ok).toBe(false);
    expect(result.gamePass).toEqual({});
  });
});
