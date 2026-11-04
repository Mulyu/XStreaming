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

describe('buildUnifiedCatalog psPlusActive', () => {
  const ps = [{name: 'Halo', isOwned: true, plusCatalog: true}];

  it('keeps the PS side while Plus runs (or is not stated)', () => {
    const [a] = buildUnifiedCatalog([], [], ps);
    const [b] = buildUnifiedCatalog([], [], ps, {psPlusActive: true});
    expect(isCatalogTitleOwned(a)).toBe(true);
    expect(isCatalogTitleOwned(b)).toBe(true);
  });

  it('reads the PS side as not owned once Plus has lapsed, owned games too', () => {
    const [item] = buildUnifiedCatalog([], [], ps, {psPlusActive: false});
    expect(item.psplus?.isOwned).toBe(false);
    expect(item.psplus?.inPlusCatalog).toBe(false);
    expect(isCatalogTitleOwned(item)).toBe(false);
  });
});
