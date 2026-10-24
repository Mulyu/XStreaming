import {extractInGamePass} from '../storePrice';
import {isInGamePass, isInPsCatalog} from '../../model/gamePass';
import type {CatalogTitle} from '../../model/unifiedCatalog';

// Shapes taken from live DisplayCatalog (fieldsTemplate=details) responses.
const withKeys = (...keys: string[]) => ({
  DisplaySkuAvailabilities: [
    {
      Availabilities: [
        {
          LicensingData: {
            SatisfyingEntitlementKeys: [
              {EntitlementKeys: keys, LicensingKeyIds: []},
            ],
          },
        },
      ],
    },
  ],
});

describe('extractInGamePass', () => {
  it('is true when a subscription entitlement can satisfy the product', () => {
    expect(
      extractInGamePass(
        withKeys(
          'xbx:Subscription:66bc4555-fa25-428f-baac-8c057955d892:Full',
          'xbx:GameV2:6e57635b-d906-4867-a4a0-b04caecb85ef:FullWithSubscription',
        ),
      ),
    ).toBe(true);
  });

  it('is false for a purchase-only product or missing data', () => {
    expect(
      extractInGamePass(
        withKeys('xbx:GameV2:6e57635b-d906-4867-a4a0-b04caecb85ef:Full'),
      ),
    ).toBe(false);
    expect(extractInGamePass({})).toBe(false);
    expect(extractInGamePass(null)).toBe(false);
    expect(
      extractInGamePass({
        DisplaySkuAvailabilities: [{Availabilities: [{LicensingData: null}]}],
      }),
    ).toBe(false);
  });
});

const title = (over: Partial<CatalogTitle>): CatalogTitle =>
  ({key: 'k', title: 'T', genres: [], ...over} as CatalogTitle);

describe('isInGamePass / isInPsCatalog', () => {
  it('matches the xCloud product id case-insensitively', () => {
    const map = {'9NPDN9R45JX4': true as const};
    expect(
      isInGamePass(
        title({
          xcloud: {raw: {productId: '9npdn9r45jx4'}, hasEntitlement: true},
        }),
        map,
      ),
    ).toBe(true);
    expect(
      isInGamePass(
        title({xcloud: {raw: {productId: 'OTHER'}, hasEntitlement: true}}),
        map,
      ),
    ).toBe(false);
    expect(isInGamePass(title({}), map)).toBe(false);
  });

  it('reads the PS catalog flag', () => {
    expect(
      isInPsCatalog(
        title({psplus: {raw: {}, isOwned: false, inPlusCatalog: true}}),
      ),
    ).toBe(true);
    expect(isInPsCatalog(title({}))).toBe(false);
  });
});
