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

  it('uses the PS Plus member discount when the plain price has no sale', () => {
    const info = parsePsStoreCtas([
      {
        type: 'UPSELL_PS_PLUS_DISCOUNT',
        meta: {upSellService: 'PS_PLUS'},
        price: {
          basePrice: '¥7,700',
          discountedPrice: '¥6,930',
          discountText: '-10%',
          endTime: 1805295600000,
          isFree: false,
          isTiedToSubscription: false,
        },
      },
      {
        type: 'PREORDER',
        meta: {upSellService: 'NONE'},
        price: {
          basePrice: '¥7,700',
          discountedPrice: '¥7,700',
          discountText: null,
          endTime: null,
          isFree: false,
          isTiedToSubscription: false,
        },
      },
    ]);
    expect(info.purchase).toEqual({
      basePrice: '¥7,700',
      discountedPrice: '¥6,930',
      discountPercent: 10,
      isFree: false,
      saleEndsAt: 1805295600000,
      memberPrice: true,
    });
    expect(isPsStoreSaleForDisplay(info)).toBe(true);
  });

  it('keeps the public sale when it beats the member discount', () => {
    const info = parsePsStoreCtas([
      trialCta('2時間'),
      buyCta(),
      {
        type: 'UPSELL_PS_PLUS_DISCOUNT',
        meta: {upSellService: 'PS_PLUS'},
        price: {
          basePrice: '¥3,400',
          discountedPrice: '¥3,060',
          discountText: '-10%',
          isTiedToSubscription: false,
        },
      },
    ]);
    expect(info.purchase?.discountPercent).toBe(30);
    expect(info.purchase?.memberPrice).toBeUndefined();
    expect(info.trial).toEqual({minutes: 120});
  });

  it('does not treat an EA Play trial or a demo download as a PS Plus trial', () => {
    const info = parsePsStoreCtas([
      buyCta(),
      {
        type: 'UPSELL_EA_ACCESS_PLAY_FIRST_TRIAL',
        meta: {upSellService: 'EA_ACCESS'},
        price: {
          basePrice: 'ゲームトライアル',
          discountedPrice: 'ゲームトライアル',
          isFree: true,
          isTiedToSubscription: true,
        },
      },
      {
        type: 'DOWNLOAD_TRIAL',
        meta: {upSellService: 'NONE'},
        price: {
          basePrice: '無料',
          discountedPrice: '無料',
          isFree: true,
          isTiedToSubscription: false,
        },
      },
    ]);
    expect(info.trial).toBeNull();
    // The demo download must not be picked as the purchase price either.
    expect(info.purchase?.discountedPrice).toBe('¥2,380');
  });
});
