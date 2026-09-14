import {steamAppIdFromUrl} from '../publicGames';

describe('steamAppIdFromUrl', () => {
  // Regression: GFN's authenticated browse query (fetchGfnFullCatalog)
  // returns storeUrl with no trailing slash before the query string at all
  // -- confirmed live against the real API: 576/576 Steam variants across
  // 3 browse pages carry a URL shaped like this. The old implementation
  // split on "/" and required the *entire* remainder after "/app/" to be
  // numeric, so the query string broke that match for effectively every
  // browse-query result (0/576 with the old code).
  it('extracts the id from a browse-query URL with a query string and no trailing slash', () => {
    expect(
      steamAppIdFromUrl(
        'https://store.steampowered.com/app/1059220?utm_source=nvidia&utm_campaign=geforce_now',
      ),
    ).toBe('1059220');
  });

  it("extracts the id from the public JSON snapshot's own URL shape", () => {
    expect(
      steamAppIdFromUrl(
        'https://store.steampowered.com/app/1358020/Some_Game/',
      ),
    ).toBe('1358020');
  });

  it('extracts the id from a bare URL with no trailing slash or query string', () => {
    expect(
      steamAppIdFromUrl('https://store.steampowered.com/app/1358020'),
    ).toBe('1358020');
  });

  it('returns undefined for a missing or empty url', () => {
    expect(steamAppIdFromUrl(undefined)).toBeUndefined();
    expect(steamAppIdFromUrl('')).toBeUndefined();
  });

  it('returns undefined when there is no id after /app/', () => {
    expect(
      steamAppIdFromUrl('https://store.steampowered.com/app/'),
    ).toBeUndefined();
    expect(
      steamAppIdFromUrl('https://store.steampowered.com/app/not-a-number'),
    ).toBeUndefined();
  });

  it('returns undefined for a URL with no /app/ segment at all', () => {
    expect(
      steamAppIdFromUrl('https://store.steampowered.com/'),
    ).toBeUndefined();
  });
});
