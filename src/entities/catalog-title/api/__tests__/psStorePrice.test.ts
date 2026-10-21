import {isPsStoreSaleForDisplay, parsePsStoreCtas} from '../psStorePrice';

// Shapes taken from live metGetPricingDataByConceptId responses (ja-JP).
const trialCta = (upsellText: string) => ({
  type: 'UPSELL_PS_PLUS_TRIAL',
  meta: {upSellService: 'PS_PLUS'},
  price: {
    basePrice: 'ゲームトライアル',
    discountedPrice: 'ゲームトライアル',
    discountText: null,
    endTime: null,
    isFree: true,
    isTiedToSubscription: true,
    upsellText,
  },
});

const buyCta = (over: Record<string, unknown> = {}) => ({
  type: 'ADD_TO_CART',
  meta: {upSellService: 'NONE'},
  price: {
    basePrice: '¥3,400',
    discountedPrice: '¥2,380',
    discountText: '-30%',
    endTime: 1792594740000,
    isFree: false,
    isTiedToSubscription: false,
    upsellText: null,
    ...over,
  },
});

describe('parsePsStoreCtas', () => {
  it('reads the sale and the trial from the same concept', () => {
    const info = parsePsStoreCtas([
      trialCta('2時間の製品版ゲームトライアルをプレイするには...'),
      buyCta(),
    ]);
    expect(info.purchase).toEqual({
      basePrice: '¥3,400',
      discountedPrice: '¥2,380',
      discountPercent: 30,
      isFree: false,
      saleEndsAt: 1792594740000,
    });
    expect(info.trial).toEqual({minutes: 120});
    expect(isPsStoreSaleForDisplay(info)).toBe(true);
  });

  it('parses fractional hours, English hours and minutes', () => {
    const minutes = (text: string) =>
      parsePsStoreCtas([trialCta(text)]).trial?.minutes;
    expect(minutes('0.5時間の製品版ゲームトライアル')).toBe(30);
    expect(minutes('Subscribe to play a 2-hour full game trial')).toBe(120);
    expect(minutes('30分の製品版ゲームトライアル')).toBe(30);
    expect(minutes('no length here')).toBeUndefined();
  });

  it('reports a trial with no purchase CTA', () => {
    const info = parsePsStoreCtas([trialCta('2時間')]);
    expect(info.purchase).toBeNull();
    expect(info.trial).not.toBeNull();
    expect(isPsStoreSaleForDisplay(info)).toBe(false);
  });

  it('ignores the Plus-catalog CTA when picking the purchase price', () => {
    const info = parsePsStoreCtas([
      {
        type: 'UPSELL_PS_PLUS_GAME_CATALOG',
        meta: {upSellService: 'PS_PLUS'},
        price: {
          basePrice: '¥8,690',
          discountedPrice: '含まれます',
          discountText: '含まれます',
          isFree: true,
          isTiedToSubscription: true,
        },
      },
      buyCta({
        basePrice: '¥8,690',
        discountedPrice: '¥3,649',
        discountText: '-58%',
      }),
    ]);
    expect(info.trial).toBeNull();
    expect(info.purchase?.discountPercent).toBe(58);
  });

  it('has no sale when the discount text is empty', () => {
    const info = parsePsStoreCtas([
      buyCta({discountedPrice: '¥3,400', discountText: null, endTime: null}),
    ]);
    expect(info.purchase?.discountPercent).toBe(0);
    expect(info.purchase?.saleEndsAt).toBeUndefined();
    expect(isPsStoreSaleForDisplay(info)).toBe(false);
  });
});
