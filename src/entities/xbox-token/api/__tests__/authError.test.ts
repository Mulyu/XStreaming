import {describeAuthError} from '../authError';

describe('describeAuthError', () => {
  it('names the step and the HTTP status', () => {
    expect(
      describeAuthError('sisu authorization', {response: {status: 401}}),
    ).toBe('sisu authorization failed: status 401');
  });

  it('adds the start of the answer, text or JSON', () => {
    expect(
      describeAuthError('device token', {
        response: {status: 400, data: {error: 'invalid_request'}},
      }),
    ).toBe('device token failed: status 400 ({"error":"invalid_request"})');
    expect(
      describeAuthError('refresh user token', {
        response: {status: 400, data: 'x'.repeat(500)},
      }).length,
    ).toBeLessThan(260);
  });

  it('falls back to the message when there was no answer (offline)', () => {
    expect(describeAuthError('device token', new Error('Network Error'))).toBe(
      'device token failed: Network Error',
    );
  });

  it('never throws on an odd error', () => {
    expect(describeAuthError('x', undefined)).toBe('x failed');
    expect(describeAuthError('x', {response: {data: undefined}})).toBe(
      'x failed',
    );
  });
});
