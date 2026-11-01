import {providerBadges, providerStatuses} from '../providerBadges';
import type {CatalogTitle} from '../unifiedCatalog';
import {palette} from '../../../../shared/config/palette';

const base = (over: Partial<CatalogTitle>): CatalogTitle => ({
  key: 'k',
  title: 'T',
  genres: [],
  ...over,
});

describe('providerStatuses', () => {
  it('is none for services that do not list the title', () => {
    expect(providerStatuses(base({}))).toEqual({
      xbox: 'none',
      gfn: 'none',
      ps: 'none',
    });
  });

  it('Xbox: entitled is owned, or catalog when it is in Game Pass', () => {
    const t = base({xcloud: {raw: {}, hasEntitlement: true}});
    expect(providerStatuses(t).xbox).toBe('owned');
    expect(providerStatuses(t, {inGamePass: true}).xbox).toBe('catalog');
    expect(
      providerStatuses(base({xcloud: {raw: {}, hasEntitlement: false}}), {
        inGamePass: true,
      }).xbox,
    ).toBe('notOwned');
  });

  it('GeForce NOW: owned when any store variant is owned', () => {
    const owned = base({
      gfn: {variants: [{owned: false}, {owned: true}] as any},
    });
    const notOwned = base({gfn: {variants: [{owned: false}] as any}});
    expect(providerStatuses(owned).gfn).toBe('owned');
    expect(providerStatuses(notOwned).gfn).toBe('notOwned');
  });

  it('PS Plus: owned beats catalog, catalog beats notOwned', () => {
    const ps = (isOwned: boolean, inPlusCatalog: boolean) =>
      providerStatuses(base({psplus: {raw: {}, isOwned, inPlusCatalog}})).ps;
    expect(ps(true, true)).toBe('owned');
    expect(ps(false, true)).toBe('catalog');
    expect(ps(false, false)).toBe('notOwned');
  });
});

describe('providerBadges', () => {
  it('lists only the services that have the title, in X / N / PS order', () => {
    const badges = providerBadges(
      base({
        psplus: {raw: {}, isOwned: false, inPlusCatalog: true},
        xcloud: {raw: {}, hasEntitlement: false},
      }),
    );
    expect(badges.map(b => b.letter)).toEqual(['X', 'PS']);
    expect(badges[0]).toMatchObject({on: false, catalog: false});
    expect(badges[1]).toMatchObject({
      on: true,
      catalog: true,
      color: palette.provider.ps,
    });
  });
});
