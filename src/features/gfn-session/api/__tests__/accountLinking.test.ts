import {syncGfnStoreConnection} from '../accountLinking';

describe('syncGfnStoreConnection', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hits /v1/sync/<platform> with a Bearer token and reports 202 as ok', async () => {
    let seenUrl = '';
    let seenInit: any;
    global.fetch = jest.fn((url: any, init?: any) => {
      seenUrl = String(url);
      seenInit = init;
      return Promise.resolve({status: 202} as Response);
    }) as any;

    const result = await syncGfnStoreConnection('steam', 'tok-123');

    expect(seenUrl).toBe('https://als.geforcenow.com/v1/sync/steam');
    expect(seenInit.method).toBe('POST');
    expect(seenInit.headers.Authorization).toBe('Bearer tok-123');
    expect(result).toEqual({ok: true, status: 202});
  });

  it('reports a non-202 status as not ok, without throwing', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({status: 404} as Response),
    ) as any;

    expect(await syncGfnStoreConnection('steam', 'tok-123')).toEqual({
      ok: false,
      status: 404,
    });
  });

  it('reports a network failure as not ok, status 0', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as any;

    expect(await syncGfnStoreConnection('steam', 'tok-123')).toEqual({
      ok: false,
      status: 0,
    });
  });
});
