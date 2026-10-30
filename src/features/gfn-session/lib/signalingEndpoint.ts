// Picks the WebRTC signaling endpoint out of a CloudMatch session's
// connectionInfo[]. Ported from OpenNOW's select_webrtc_endpoint /
// webrtc_signaling_endpoint (native/opennow-core/src/cloudmatch.rs).
//
// A session can list several usage=14 entries: the WebRTC signaling one
// (wss/https or a bare path) and a native-client one (appLevelProtocol 1/6, or
// an rtsp(s) URL). Connecting to the native one opens fine but never sends an
// offer, so the stream sits at "signaling connected" forever. Prefer the
// WebRTC entries and only fall back to the others.

export type SignalingConnection = {
  ip?: string | string[];
  port?: number;
  usage?: number;
  resourcePath?: string;
  appLevelProtocol?: number;
};

export type SignalingEndpoint = {
  /** wss://host[:port]/path/ — the nvst sign_in URL is built on top of it. */
  url: string;
  /** Address of the game server (the connection's ip, else the URL's host). */
  serverIp: string;
  /** Index into connectionInfo[] of the entry that was chosen. */
  index: number;
};

const USAGE_SIGNALING = 14;
const USAGE_NATIVE_SIGNALING = 16;

const firstIp = (ip?: string | string[]): string | undefined => {
  const value = Array.isArray(ip) ? ip[0] : ip;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const isRtsp = (resource: string): boolean => /^rtsps?:\/\//.test(resource);

const isNativeProtocol = (connection: SignalingConnection): boolean =>
  connection.appLevelProtocol === 1 || connection.appLevelProtocol === 6;

const isUnspecifiedIp = (host: string): boolean =>
  host === '0.0.0.0' || host === '::' || host === '[::]';

const withBrackets = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

// "host:port" or "[v6]:port" authority -> bare host, no port.
const hostOfAuthority = (authority: string): string => {
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    return end > 0 ? authority.slice(0, end + 1) : '';
  }
  return authority.split(':')[0];
};

const isValidAuthority = (authority: string): boolean =>
  authority.length > 0 && !/[\s@]/.test(authority);

const endpointUrl = (connection: SignalingConnection): string | null => {
  const usage = connection.usage;
  if (usage !== USAGE_SIGNALING && usage !== USAGE_NATIVE_SIGNALING) {
    return null;
  }
  const resource =
    connection.resourcePath && connection.resourcePath.length > 0
      ? connection.resourcePath
      : '/nvst/';

  if (isRtsp(resource)) {
    // rtsps://host:48322 is the native descriptor; the WebRTC signaling
    // service lives on the same host at the default wss port.
    const rest = resource.slice(resource.indexOf('://') + 3);
    const authority = rest.split(/[/?#]/)[0];
    const host = hostOfAuthority(authority);
    if (!isValidAuthority(host) || host.startsWith('.')) {
      return null;
    }
    return `wss://${host}/nvst/`;
  }

  if (resource.startsWith('wss://') || resource.startsWith('https://')) {
    const rest = resource.slice(resource.indexOf('://') + 3);
    const authority = rest.split(/[/?#]/)[0];
    if (!isValidAuthority(authority) || resource.includes('#')) {
      return null;
    }
    return `wss://${rest}`;
  }

  if (!resource.startsWith('/') || resource.includes('://')) {
    return null;
  }
  const ip = firstIp(connection.ip);
  if (!ip || isUnspecifiedIp(ip)) {
    return null;
  }
  let authority = withBrackets(ip);
  const native =
    usage === USAGE_NATIVE_SIGNALING || isNativeProtocol(connection);
  if (!native && connection.port !== undefined && connection.port !== null) {
    const port = connection.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
    if (port !== 443) {
      authority = `${authority}:${port}`;
    }
  }
  return `wss://${authority}${resource}`;
};

const hostOfUrl = (url: string): string =>
  hostOfAuthority(url.slice('wss://'.length).split(/[/?#]/)[0]).replace(
    /^\[|\]$/g,
    '',
  );

const isWebRtcFirst = (connection: SignalingConnection): boolean => {
  const resource = connection.resourcePath ?? '';
  return (
    resource.startsWith('wss://') ||
    resource.startsWith('https://') ||
    (connection.usage === USAGE_SIGNALING &&
      !isNativeProtocol(connection) &&
      !isRtsp(resource))
  );
};

export const selectSignalingEndpoint = (
  connections: SignalingConnection[],
): SignalingEndpoint | null => {
  const indexed = connections.map((connection, index) => ({connection, index}));
  const ordered = [
    ...indexed.filter(({connection}) => isWebRtcFirst(connection)),
    ...indexed.filter(({connection}) => connection.usage === USAGE_SIGNALING),
    ...indexed.filter(
      ({connection}) => connection.usage === USAGE_NATIVE_SIGNALING,
    ),
  ];
  for (const {connection, index} of ordered) {
    const url = endpointUrl(connection);
    if (url) {
      return {url, serverIp: firstIp(connection.ip) ?? hostOfUrl(url), index};
    }
  }
  return null;
};

// One line per connection, for the on-device log when a stream stalls.
export const describeConnections = (
  connections: SignalingConnection[],
  chosen: SignalingEndpoint | null,
): string => {
  const lines = connections.map((c, i) => {
    const ip = Array.isArray(c.ip) ? c.ip.join(',') : c.ip ?? '-';
    return (
      `${i === chosen?.index ? '>' : ' '}[${i}] usage=${c.usage ?? '?'}` +
      ` proto=${c.appLevelProtocol ?? '-'} ip=${ip} port=${c.port ?? '-'}` +
      ` path=${c.resourcePath ?? '-'}`
    );
  });
  return `${lines.join('\n')}\n=> ${chosen?.url ?? 'no WebRTC endpoint'}`;
};
