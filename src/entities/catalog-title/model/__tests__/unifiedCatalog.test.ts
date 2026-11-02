import {buildUnifiedCatalog, isCatalogTitleOwned} from '../unifiedCatalog';

const xcloud = (entitled: boolean) => [
  {ProductTitle: 'Halo', details: {hasEntitlement: entitled}},
];

describe('buildUnifiedCatalog xboxActive', () => {
  it('keeps the entitlement when the membership is active or unknown', () => {
    expect(isCatalogTitleOwned(buildUnifiedCatalog(xcloud(true), [])[0])).toBe(
      true,
    );
    expect(
      isCatalogTitleOwned(
        buildUnifiedCatalog(xcloud(true), [], [], {xboxActive: true})[0],
      ),
    ).toBe(true);
  });

  it('reads the Xbox side as not owned when the membership has lapsed', () => {
    const [item] = buildUnifiedCatalog(xcloud(true), [], [], {
      xboxActive: false,
    });
    expect(item.xcloud?.hasEntitlement).toBe(false);
    expect(isCatalogTitleOwned(item)).toBe(false);
  });

  it('leaves the other services alone', () => {
    const [item] = buildUnifiedCatalog(
      xcloud(true),
      [],
      [{name: 'Halo', isOwned: true, plusCatalog: false}],
      {xboxActive: false},
    );
    expect(item.xcloud?.hasEntitlement).toBe(false);
    expect(isCatalogTitleOwned(item)).toBe(true);
  });
});
