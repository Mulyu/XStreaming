import {addGridPageSales, gridProductSale, lookupPsSale} from '../psStoreGrid';

// Price shapes taken from live categoryGridRetrieve responses (ja-JP).
const price = (over: Record<string, unknown> = {}) => ({
  basePrice: '¥7,370',
  discountedPrice: '¥7,370',
  discountText: null,
  upsellText: null,
  upsellServiceBranding: ['NONE'],
  ...over,
});

describe('gridProductSale', () => {
  it('reads the public sale percent', () => {
    expect(gridProductSale(price({discountText: '-60%'}))).toBe(60);
  });

  it('is 0 without a discount or for a Plus-catalog upsell', () => {
    expect(gridProductSale(price())).toBe(0);
    expect(
      gridProductSale(
        price({upsellText: 'エクストラ', upsellServiceBranding: ['PS_PLUS']}),
      ),
    ).toBe(0);
  });

  it('uses a PS Plus member discount when there is no public sale', () => {
    expect(
      gridProductSale(
        price({upsellText: '10%オフ', upsellServiceBranding: ['PS_PLUS']}),
      ),
    ).toBe(10);
  });

  it('ignores "さらに" (stacking) member text next to a sale, and non-Plus upsells', () => {
    expect(
      gridProductSale(
        price({
          discountText: '-30%',
          upsellText: 'さらに10%オフ',
          upsellServiceBranding: ['PS_PLUS'],
        }),
      ),
    ).toBe(30);
    expect(
      gridProductSale(
        price({upsellText: '10%オフ', upsellServiceBranding: ['EA_ACCESS']}),
      ),
    ).toBe(0);
  });
});

describe('addGridPageSales / lookupPsSale', () => {
  const sales = {};
  addGridPageSales(sales, [
    {
      id: 'JP0001-PPSA01_00-AAA',
      name: 'Street Fighter™ 6',
      price: price({discountText: '-60%'}),
    },
    {id: 'JP0001-PPSA02_00-BBB', name: 'Full Price', price: price()},
  ]);

  it('keeps only discounted titles', () => {
    expect(Object.keys(sales).sort()).toEqual([
      'JP0001-PPSA01_00-AAA',
      'n:street fighter 6',
    ]);
  });

  it('finds a sale by product id, store product id or name', () => {
    expect(lookupPsSale(sales, {productId: 'JP0001-PPSA01_00-AAA'})).toBe(60);
    expect(lookupPsSale(sales, {storeProductId: 'JP0001-PPSA01_00-AAA'})).toBe(
      60,
    );
    expect(
      lookupPsSale(sales, {productId: 'X', name: 'Street Fighter 6'}),
    ).toBe(60);
    expect(
      lookupPsSale(sales, {
        productId: 'JP0001-PPSA02_00-BBB',
        name: 'Full Price',
      }),
    ).toBe(0);
  });
});
