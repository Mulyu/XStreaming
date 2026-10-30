import {
  describeConnections,
  selectSignalingEndpoint,
} from '../signalingEndpoint';

describe('selectSignalingEndpoint', () => {
  it('prefers the WebRTC usage=14 entry over a native one listed first', () => {
    const connections = [
      {
        usage: 14,
        ip: '10.0.0.1',
        port: 48322,
        appLevelProtocol: 6,
        resourcePath: 'rtsps://10.0.0.1:48322',
      },
      {usage: 14, ip: '80.1.2.3', port: 443, resourcePath: '/nvst/'},
    ];
    expect(selectSignalingEndpoint(connections)).toEqual({
      url: 'wss://80.1.2.3/nvst/',
      serverIp: '80.1.2.3',
      index: 1,
    });
  });

  it('uses an explicit wss resource path as given', () => {
    const result = selectSignalingEndpoint([
      {usage: 14, ip: '1.1.1.1', appLevelProtocol: 1, resourcePath: '/nvst/'},
      {usage: 14, ip: '2.2.2.2', resourcePath: 'wss://sig.example.net/nvst/'},
    ]);
    expect(result?.url).toBe('wss://sig.example.net/nvst/');
    expect(result?.serverIp).toBe('2.2.2.2');
  });

  it('converts a lone rtsps usage=14 entry to the wss host', () => {
    const result = selectSignalingEndpoint([
      {
        usage: 14,
        resourcePath: 'rtsps://80-250-97-40.server.net:48322',
      },
    ]);
    expect(result).toEqual({
      url: 'wss://80-250-97-40.server.net/nvst/',
      serverIp: '80-250-97-40.server.net',
      index: 0,
    });
  });

  it('falls back to usage=16 and ignores the port for native entries', () => {
    const result = selectSignalingEndpoint([
      {usage: 2, ip: '9.9.9.9', port: 1000},
      {usage: 16, ip: '5.5.5.5', port: 49100, resourcePath: '/nvst/'},
    ]);
    expect(result?.url).toBe('wss://5.5.5.5/nvst/');
  });

  it('keeps a non-default port for WebRTC entries and brackets IPv6', () => {
    expect(
      selectSignalingEndpoint([
        {usage: 14, ip: '3.3.3.3', port: 8443, resourcePath: '/nvst/'},
      ])?.url,
    ).toBe('wss://3.3.3.3:8443/nvst/');
    expect(
      selectSignalingEndpoint([
        {usage: 14, ip: ['2001:db8::1'], resourcePath: '/nvst/'},
      ])?.url,
    ).toBe('wss://[2001:db8::1]/nvst/');
  });

  it('skips unusable entries and returns null when none work', () => {
    expect(
      selectSignalingEndpoint([
        {usage: 14, ip: '0.0.0.0', resourcePath: '/nvst/'},
        {usage: 14, ip: '4.4.4.4', port: 99999, resourcePath: '/nvst/'},
        {usage: 2, ip: '4.4.4.4'},
      ]),
    ).toBeNull();
    expect(selectSignalingEndpoint([])).toBeNull();
  });

  it('defaults the path to /nvst/ when none is given', () => {
    expect(selectSignalingEndpoint([{usage: 14, ip: '6.6.6.6'}])?.url).toBe(
      'wss://6.6.6.6/nvst/',
    );
  });
});

describe('describeConnections', () => {
  it('marks the chosen entry', () => {
    const connections = [
      {usage: 14, ip: '1.1.1.1', appLevelProtocol: 1},
      {usage: 14, ip: '2.2.2.2', resourcePath: '/nvst/'},
    ];
    const text = describeConnections(
      connections,
      selectSignalingEndpoint(connections),
    );
    expect(text).toContain('>[1] usage=14');
    expect(text).toContain(' [0] usage=14 proto=1');
    expect(text).toContain('=> wss://2.2.2.2/nvst/');
  });
});
