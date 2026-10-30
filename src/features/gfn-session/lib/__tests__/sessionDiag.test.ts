import {describeSessionObject} from '../sessionDiag';

describe('describeSessionObject', () => {
  it('lists scalars and nested objects, hides ids and secrets', () => {
    const text = describeSessionObject({
      sessionId: 'abc',
      status: 2,
      gpuType: 'L40',
      errorCode: null,
      authToken: 'secret',
      iceServerConfiguration: {iceServers: [{credential: 'x'}]},
      finalizedStreamingFeatures: {codec: 1, nested: {deep: {deeper: 1}}},
      list: [1, 2, 3],
    });
    expect(text).toContain('status=2');
    expect(text).toContain('gpuType=L40');
    expect(text).toContain('errorCode=null');
    expect(text).toContain(
      'finalizedStreamingFeatures={codec=1 nested={deep={…}}}',
    );
    expect(text).toContain('list=[3]');
    expect(text).not.toMatch(/abc|secret|credential/);
  });

  it('truncates long strings', () => {
    expect(describeSessionObject({note: 'x'.repeat(100)})).toBe(
      `note=${'x'.repeat(40)}…`,
    );
  });

  it('handles a missing session', () => {
    expect(describeSessionObject(undefined)).toBe('no session object');
  });
});
