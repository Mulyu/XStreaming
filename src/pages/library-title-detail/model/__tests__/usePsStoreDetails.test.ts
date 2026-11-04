jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {getString: () => undefined, set: () => {}},
}));

import {psIdOf} from '../usePsStoreDetails';
import {CatalogTitle} from '../../../../entities/catalog-title';

const title = (extra: Partial<CatalogTitle>): CatalogTitle => ({
  key: 'k',
  title: 'Game',
  genres: [],
  ...extra,
});

describe('psIdOf', () => {
  it('prefers the concept, whose rating pools every edition', () => {
    const t = title({
      psplus: {raw: {conceptId: 123, productId: 'UP1'}} as any,
    });
    expect(psIdOf(t)).toEqual({conceptId: '123'});
  });

  it('falls back to the catalog product id', () => {
    const t = title({psplus: {raw: {productId: 'UP1'}} as any});
    expect(psIdOf(t)).toEqual({productId: 'UP1'});
  });

  it('uses the store product id of a title the catalog does not hold', () => {
    const t = title({store: {refs: {ps: 'UP9'}, snapshot: {}} as any});
    expect(psIdOf(t)).toEqual({productId: 'UP9'});
  });

  it('is null for a title with no PlayStation presence', () => {
    expect(psIdOf(title({}))).toBeNull();
    expect(psIdOf(undefined)).toBeNull();
  });
});
