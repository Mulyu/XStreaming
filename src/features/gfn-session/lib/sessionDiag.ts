// Compact, secret-free one-liner of a CloudMatch session object, for the stall
// screen. Shows what the server decided (state, features, profile) without the
// ids, tokens and ICE credentials that must not end up in a screenshot.

const SKIP_KEYS = new Set([
  'sessionId',
  'subSessionId',
  'iceServerConfiguration',
  'connectionInfo',
  'sessionRequestData',
  'sessionControlInfo',
]);
const SECRET = /token|credential|password|secret|auth|key|jwt|cookie/i;
const MAX_VALUE = 40;
const MAX_DEPTH = 2;

const summarize = (value: unknown, depth: number): string => {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (depth >= MAX_DEPTH) {
    return '{…}';
  }
  const parts = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET.test(key))
    .map(([key, v]) => `${key}=${summarize(v, depth + 1)}`);
  return `{${parts.join(' ')}}`;
};

export const describeSessionObject = (session: unknown): string => {
  if (!session || typeof session !== 'object') {
    return 'no session object';
  }
  return Object.entries(session as Record<string, unknown>)
    .filter(([key]) => !SKIP_KEYS.has(key) && !SECRET.test(key))
    .map(([key, v]) => `${key}=${summarize(v, 0)}`)
    .join(' ');
};
