import {parseResultsHtml} from '../steamCharts';

// Fixtures mirror the real shape of a Steam search results row -- each row
// starts at `<a href="https://store.steampowered.com/app/<id>/...">`, which
// is also the split boundary parseResultsHtml relies on.
const row = (inner: string) =>
  `<a href="https://store.steampowered.com/app/${inner}</a>`;

describe('parseResultsHtml', () => {
  it('parses a regular, non-discounted priced game', () => {
    const html = row(
      '570/Dota_2/?snr=1" data-ds-appid="570">' +
        '<img src="https://cdn.example.com/570/capsule.jpg">' +
        '<span class="title">Dota 2</span>' +
        '<div class="discount_final_price">$0.00</div>',
    );
    const entries = parseResultsHtml(html);
    expect(entries).toEqual([
      {
        appId: '570',
        title: 'Dota 2',
        imageUrl: 'https://cdn.example.com/570/capsule.jpg',
        price: '$0.00',
        originalPrice: undefined,
        discountPercent: undefined,
      },
    ]);
  });

  it('parses a discounted game with both prices and a discount percent', () => {
    const html = row(
      '1091500/Cyberpunk_2077/">' +
        '<img src="https://cdn.example.com/1091500/capsule.jpg">' +
        '<span class="title">Cyberpunk 2077</span>' +
        '<div class="discount_pct">-50%</div>' +
        '<div class="discount_original_price">$59.99</div>' +
        '<div class="discount_final_price">$29.99</div>',
    );
    const entries = parseResultsHtml(html);
    expect(entries).toEqual([
      {
        appId: '1091500',
        title: 'Cyberpunk 2077',
        imageUrl: 'https://cdn.example.com/1091500/capsule.jpg',
        price: '$29.99',
        originalPrice: '$59.99',
        discountPercent: 50,
      },
    ]);
  });

  it('parses a free game with no original price or discount', () => {
    const html = row(
      '440/Team_Fortress_2/">' +
        '<span class="title">Team Fortress 2</span>' +
        '<div class="discount_final_price">Free To Play</div>',
    );
    const entries = parseResultsHtml(html);
    expect(entries[0]).toMatchObject({
      appId: '440',
      title: 'Team Fortress 2',
      price: 'Free To Play',
      originalPrice: undefined,
      discountPercent: undefined,
    });
  });

  it('skips a malformed row missing the title span', () => {
    const html = row(
      '123/No_Title/">' + '<div class="discount_final_price">$1.00</div>',
    );
    expect(parseResultsHtml(html)).toEqual([]);
  });

  it('skips a row with no leading numeric appId', () => {
    const malformed =
      '<a href="https://store.steampowered.com/app/">' +
      '<span class="title">No Id</span></a>';
    expect(parseResultsHtml(malformed)).toEqual([]);
  });

  it('parses multiple consecutive rows independently', () => {
    const html =
      row(
        '1/Game_One/">' +
          '<span class="title">Game One</span>' +
          '<div class="discount_final_price">$10.00</div>',
      ) +
      row(
        '2/Game_Two/">' +
          '<span class="title">Game Two</span>' +
          '<div class="discount_final_price">$20.00</div>',
      );
    const entries = parseResultsHtml(html);
    expect(entries.map(e => e.appId)).toEqual(['1', '2']);
    expect(entries.map(e => e.title)).toEqual(['Game One', 'Game Two']);
  });

  it('returns an empty array for a page with zero result rows', () => {
    expect(parseResultsHtml('<div>no results</div>')).toEqual([]);
  });
});
