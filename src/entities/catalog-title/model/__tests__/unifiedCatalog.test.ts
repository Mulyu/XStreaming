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

  it('keeps a game bought outside Game Pass owned (it plays with ads)', () => {
    const bought = [
      {
        ProductTitle: 'Halo',
        details: {hasEntitlement: true, userPrograms: ['FERDINAND']},
      },
    ];
    const [item] = buildUnifiedCatalog(bought, [], [], {xboxActive: false});
    expect(item.xcloud?.hasEntitlement).toBe(true);
    expect(isCatalogTitleOwned(item)).toBe(true);
  });

  it('still reads a Game Pass-only title as not owned once the membership lapsed', () => {
    const gamePass = [
      {
        ProductTitle: 'Halo',
        details: {hasEntitlement: true, userPrograms: ['GPULTIMATE']},
      },
    ];
    const [item] = buildUnifiedCatalog(gamePass, [], [], {xboxActive: false});
    expect(item.xcloud?.hasEntitlement).toBe(false);
  });

  it('owns a bought game that Game Pass also lists', () => {
    const both = [
      {
        ProductTitle: 'Halo',
        details: {
          hasEntitlement: true,
          userPrograms: ['GPULTIMATE', 'FERDINAND'],
        },
      },
    ];
    const [item] = buildUnifiedCatalog(both, [], [], {xboxActive: false});
    expect(item.xcloud?.hasEntitlement).toBe(true);
  });

  it('does not own a title the account has no entitlement for, programs or not', () => {
    const none = [
      {
        ProductTitle: 'Halo',
        details: {hasEntitlement: false, userPrograms: ['FERDINAND']},
      },
    ];
    const [item] = buildUnifiedCatalog(none, [], [], {xboxActive: false});
    expect(item.xcloud?.hasEntitlement).toBe(false);
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

describe('buildUnifiedCatalog GFN listings through Game Pass', () => {
  const gfn = [
    {
      id: '1',
      title: 'Halo',
      store: 'XBOX',
      genres: [],
      owned: true,
      subscription: 'XBOX_GAME_PASS',
    },
    {id: '2', title: 'Halo', store: 'STEAM', genres: [], owned: true},
  ];

  it('keeps them owned while the membership runs (or is not stated)', () => {
    const [a] = buildUnifiedCatalog([], gfn);
    const [b] = buildUnifiedCatalog([], gfn, [], {xboxActive: true});
    expect(a.gfn?.variants.map(v => v.owned)).toEqual([true, true]);
    expect(b.gfn?.variants.map(v => v.owned)).toEqual([true, true]);
  });

  it('stops counting them as owned once Game Pass has lapsed, bought ones stay', () => {
    const [item] = buildUnifiedCatalog([], gfn, [], {xboxActive: false});
    expect(item.gfn?.variants.map(v => v.owned)).toEqual([false, true]);
    expect(isCatalogTitleOwned(item)).toBe(true);
    const [only] = buildUnifiedCatalog([], [gfn[0]], [], {xboxActive: false});
    expect(isCatalogTitleOwned(only)).toBe(false);
  });
});
