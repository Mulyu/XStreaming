const mockFetch = jest.fn();
jest.mock('../../../../entities/xbox-token', () => ({
  CONTENT_ACCESS_RELYING_PARTY: 'http://mp.microsoft.com/',
  fetchStreamingTime: (...a: any[]) => mockFetch(...a),
  summarizeStreamingTime: (d: any) => d?.summary ?? null,
}));

import {loadStreamingTime} from '../streamingTime';

const xsts = {data: {Token: 'tok', DisplayClaims: {xui: [{uhs: 'uhs1'}]}}};

const xalAuth = (getToken: jest.Mock) => ({
  _tokenStore: {getAuthenticationMethod: () => 'xal'},
  _xal: {getTokenForRelyingParty: getToken},
});

let n = 0;
// A different "now" each time keeps the 2-minute cache from answering.
const nextNow = () => (n += 10 * 60 * 1000);

describe('loadStreamingTime', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns the remaining seconds, using the mp.microsoft.com token', async () => {
    const getToken = jest.fn().mockResolvedValue(xsts);
    mockFetch.mockResolvedValue({
      summary: {adFree: {unlimited: false, seconds: 3600}},
    });
    const result = await loadStreamingTime(xalAuth(getToken), 'JP', nextNow());
    expect(result).toEqual({
      ok: true,
      summary: {adFree: {unlimited: false, seconds: 3600}},
    });
    expect(getToken.mock.calls[0][1]).toBe('http://mp.microsoft.com/');
    expect(mockFetch.mock.calls[0][0]).toEqual({
      token: 'tok',
      userHash: 'uhs1',
    });
  });

  it('says the token step failed, with the status and XErr', async () => {
    const getToken = jest
      .fn()
      .mockRejectedValue({response: {status: 401, data: {XErr: 2148916233}}});
    const result = await loadStreamingTime(xalAuth(getToken), 'JP', nextNow());
    expect(result).toEqual({ok: false, reason: 'token 401 (XErr 2148916233)'});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says the request step failed', async () => {
    mockFetch.mockRejectedValue({response: {status: 403}});
    const result = await loadStreamingTime(
      xalAuth(jest.fn().mockResolvedValue(xsts)),
      'JP',
      nextNow(),
    );
    expect(result).toEqual({ok: false, reason: 'request 403'});
  });

  it('keeps a decode failure recognizable', async () => {
    mockFetch.mockRejectedValue(new Error('decode: truncated field'));
    const result = await loadStreamingTime(
      xalAuth(jest.fn().mockResolvedValue(xsts)),
      'JP',
      nextNow(),
    );
    expect(result).toEqual({ok: false, reason: 'decode: truncated field'});
  });

  it('names a network failure by its step', async () => {
    mockFetch.mockRejectedValue(new Error('Network Error'));
    const result = await loadStreamingTime(
      xalAuth(jest.fn().mockResolvedValue(xsts)),
      'JP',
      nextNow(),
    );
    expect(result).toEqual({ok: false, reason: 'request: Network Error'});
  });

  it('is not signed in without an authentication object', async () => {
    expect(await loadStreamingTime(null, 'JP', nextNow())).toEqual({
      ok: false,
      reason: 'no sign-in',
    });
  });
});
