import {storage} from '../store/mmkv';

// GeForce NOW device-code (QR) login. NVIDIA's Steam Deck client uses the OAuth
// 2.0 device-authorization grant, which is a great fit for a TV/handheld app:
// we show the user a short code + URL, they approve on their phone/PC, and we
// poll for tokens. Ported from OpenNOW (MIT) and adapted for React Native (no
// node crypto/os — the device id is a persisted random hex string instead).

const DEVICE_AUTHORIZE_ENDPOINT = 'https://login.nvidia.com/device/authorize';
const TOKEN_ENDPOINT = 'https://login.nvidia.com/token';
const CLIENT_TOKEN_ENDPOINT = 'https://login.nvidia.com/client_token';

// NVIDIA's Steam Deck OAuth client. Its device-code flow needs no client secret
// and grants the streaming scopes we need.
const STEAM_DECK_CLIENT_ID = 'q61ddeJrVt7O90Nl-P-N7I36yctih4Ml6FyXLrb6j-U';
const SCOPES = 'openid consent email tk_client age';
// NVIDIA identity provider (as opposed to a partner IdP such as bro.game).
const DEFAULT_IDP_ID = 'PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg';
const STEAM_DECK_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; Steam Deck) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const GFN_PLAY_ORIGIN = 'https://play.geforcenow.com';
const GFN_PLAY_REFERER = 'https://play.geforcenow.com/';

const DEVICE_ID_KEY = 'gfn.deviceId';
const TOKENS_KEY = 'gfn.tokens';
// Refresh proactively once the access token is within this window of expiry.
const REFRESH_WINDOW_MS = 10 * 60 * 1000;
// Same idea for the client token (see refreshWithClientToken() below).
const CLIENT_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type GfnTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  clientToken?: string;
  // The client token's own expiry -- distinct from `expiresAt` (the access/
  // id token's). See refreshWithClientToken() below for why this exists.
  clientTokenExpiresAt?: number;
  expiresAt: number;
  authClientId: string;
};

export type GfnDeviceChallenge = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalSeconds: number;
};

export type GfnTokenError = {error: string; error_description?: string};

const toExpiresAt = (
  expiresInSeconds?: number,
  defaultSeconds = 86400,
): number => Date.now() + (expiresInSeconds ?? defaultSeconds) * 1000;

// A stable, opaque device identifier. RN has no os.hostname()/node crypto, so we
// generate 64 random hex chars once and persist them in MMKV.
const getDeviceId = (): string => {
  let id = storage.getString(DEVICE_ID_KEY);
  if (id && /^[0-9a-f]{16,}$/.test(id)) {
    return id;
  }
  let hex = '';
  for (let i = 0; i < 64; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  id = hex;
  try {
    storage.set(DEVICE_ID_KEY, id);
  } catch {}
  return id;
};

const buildAuthHeaders = (contentType?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    Origin: GFN_PLAY_ORIGIN,
    Referer: GFN_PLAY_REFERER,
    'User-Agent': STEAM_DECK_USER_AGENT,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
};

// Step 1: ask NVIDIA to start a device-code login. Returns the short user code
// and the URL(s) the user approves on.
export const requestDeviceAuthorization =
  async (): Promise<GfnDeviceChallenge> => {
    const deviceId = getDeviceId();
    const body = new URLSearchParams({
      client_id: STEAM_DECK_CLIENT_ID,
      scope: SCOPES,
      device_id: deviceId,
      display_name: 'XStreaming',
      idp_id: DEFAULT_IDP_ID,
    });

    const response = await fetch(DEVICE_AUTHORIZE_ENDPOINT, {
      method: 'POST',
      headers: {
        ...buildAuthHeaders('application/x-www-form-urlencoded; charset=UTF-8'),
        'x-device-id': deviceId,
        'nv-client-id': STEAM_DECK_CLIENT_ID,
        'nv-client-streamer': 'WEBRTC',
        'nv-client-type': 'BROWSER',
        'nv-client-platform-name': 'browser',
        'nv-browser-type': 'CHROME',
        'nv-device-os': 'STEAMOS',
        'nv-device-type': 'CONSOLE',
        'nv-device-model': 'STEAMDECK',
        'nv-device-make': 'VALVE',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `GFN device authorization failed (${response.status}): ${text.slice(
          0,
          300,
        )}`,
      );
    }

    const payload = (await response.json()) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      verification_uri_complete?: string;
      expires_in?: number;
      interval?: number;
    };

    if (
      !payload.device_code ||
      !payload.user_code ||
      !payload.verification_uri ||
      !payload.verification_uri_complete
    ) {
      throw new Error('GFN device authorization response was incomplete');
    }

    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      verificationUriComplete: payload.verification_uri_complete,
      expiresAt: toExpiresAt(payload.expires_in, 600),
      intervalSeconds: Math.max(1, payload.interval ?? 5),
    };
  };

// Step 2 (single attempt): trade the device code for tokens. While the user has
// not approved yet this returns {error: 'authorization_pending'} (or
// 'slow_down'); pollForTokens loops over this.
export const exchangeDeviceCode = async (
  deviceCode: string,
): Promise<GfnTokens | GfnTokenError> => {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: STEAM_DECK_CLIENT_ID,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: buildAuthHeaders(
      'application/x-www-form-urlencoded; charset=UTF-8',
    ),
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    any
  > | null;

  if (!response.ok) {
    return payload && typeof payload === 'object'
      ? (payload as GfnTokenError)
      : {
          error: 'device_token_exchange_failed',
          error_description: `Device token exchange failed (${response.status})`,
        };
  }

  if (!payload?.access_token) {
    return {
      error: 'invalid_token_response',
      error_description: 'Device token response did not include access_token',
    };
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    idToken: payload.id_token,
    clientToken: payload.client_token,
    expiresAt: toExpiresAt(payload.expires_in),
    authClientId: STEAM_DECK_CLIENT_ID,
  };
};

const isTokens = (v: GfnTokens | GfnTokenError): v is GfnTokens =>
  (v as GfnTokens).accessToken !== undefined;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Step 2 (loop): poll the token endpoint until the user approves, the code
// expires, or the caller cancels. Persists tokens on success.
export const pollForTokens = async (
  challenge: GfnDeviceChallenge,
  options: {shouldCancel?: () => boolean} = {},
): Promise<GfnTokens> => {
  let intervalMs = challenge.intervalSeconds * 1000;

  while (Date.now() < challenge.expiresAt) {
    if (options.shouldCancel?.()) {
      throw new Error('cancelled');
    }
    await delay(intervalMs);
    if (options.shouldCancel?.()) {
      throw new Error('cancelled');
    }

    const result = await exchangeDeviceCode(challenge.deviceCode);
    if (isTokens(result)) {
      setStoredTokens(result);
      return result;
    }

    // Not approved yet: keep waiting. 'slow_down' asks us to back off.
    if (result.error === 'authorization_pending') {
      continue;
    }
    if (result.error === 'slow_down') {
      intervalMs += 5000;
      continue;
    }
    // Any other error (expired_token, access_denied, ...) is terminal.
    throw new Error(result.error_description || result.error);
  }

  throw new Error('expired_token');
};

// Refresh an access token using the refresh token.
export const refreshAuthTokens = async (
  refreshToken: string,
  authClientId = STEAM_DECK_CLIENT_ID,
): Promise<GfnTokens> => {
  // No `scope` param here, matching OpenNOW's (the reference this flow was
  // ported from) working refresh request exactly. An earlier attempt to add
  // it here (to force a fresh id_token) is suspected of making NVIDIA's
  // rotating refresh tokens (see refreshOnce() below) fail outright on
  // refresh instead -- riding out the old access/id token until it truly
  // expires and then forcing a full re-login every few hours, matching what
  // was reported. Standard OIDC refresh already re-issues the id_token for
  // the original (openid-inclusive) grant without re-specifying scope; the
  // effectiveExpiresAt()/oldIdValid handling below is the safety net if that
  // ever doesn't hold.
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: authClientId,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: buildAuthHeaders(
      'application/x-www-form-urlencoded; charset=UTF-8',
    ),
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GFN token refresh failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as Record<string, any>;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    idToken: payload.id_token,
    clientToken: payload.client_token,
    expiresAt: toExpiresAt(payload.expires_in),
    authClientId,
  };
};

// NVIDIA's actual long-session mechanism, confirmed from OpenNOW's real,
// working client (the reference this whole flow was ported from): once a
// session has a client token, refreshing THAT is what keeps a long-idle
// session alive, tried before the plain refresh_token grant, not instead of
// it. The port here previously only had the refresh_token half, which is
// suspected to be why a session left idle for hours (backgrounded, no
// periodic refresh) sometimes couldn't recover at all -- fetchUserInfo-style
// per-account identity isn't needed since NVIDIA's own JWTs already carry the
// `sub` this grant wants (see jwtSub() below).
export const requestClientToken = async (
  accessToken: string,
): Promise<{clientToken: string; clientTokenExpiresAt: number}> => {
  const response = await fetch(CLIENT_TOKEN_ENDPOINT, {
    headers: {
      ...buildAuthHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GFN client token request failed (${response.status}): ${text.slice(
        0,
        300,
      )}`,
    );
  }

  const payload = (await response.json()) as Record<string, any>;
  if (!payload.client_token) {
    throw new Error('GFN client token response had no client_token');
  }
  return {
    clientToken: payload.client_token,
    clientTokenExpiresAt: toExpiresAt(payload.expires_in),
  };
};

// Refresh using the client token instead of the OAuth refresh token --
// NVIDIA's own `client_token` grant (not part of standard OAuth2/OIDC).
export const refreshWithClientToken = async (
  clientToken: string,
  userId: string,
  authClientId = STEAM_DECK_CLIENT_ID,
): Promise<Record<string, any>> => {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:client_token',
    client_token: clientToken,
    client_id: authClientId,
    sub: userId,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: buildAuthHeaders(
      'application/x-www-form-urlencoded; charset=UTF-8',
    ),
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GFN client-token refresh failed (${response.status}): ${text.slice(
        0,
        300,
      )}`,
    );
  }

  return (await response.json()) as Record<string, any>;
};

// ---- Token persistence (MMKV) ----

export const getStoredTokens = (): GfnTokens | null => {
  const raw = storage.getString(TOKENS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.accessToken === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

export const setStoredTokens = (tokens: GfnTokens): void => {
  try {
    storage.set(TOKENS_KEY, JSON.stringify(tokens));
  } catch {}
};

export const clearStoredTokens = (): void => {
  try {
    storage.delete(TOKENS_KEY);
  } catch {}
};

export const isSignedIn = (): boolean => getStoredTokens() !== null;

// Base64url-decode a string without relying on atob (not guaranteed in RN).
const base64UrlDecode = (input: string): string => {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) {
    s += '=';
  }
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < s.length; i += 4) {
    const e1 = chars.indexOf(s[i]);
    const e2 = chars.indexOf(s[i + 1]);
    const e3 = chars.indexOf(s[i + 2]);
    const e4 = chars.indexOf(s[i + 3]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    output += String.fromCharCode(c1);
    if (e3 !== 64 && e3 !== -1) {
      output += String.fromCharCode(c2);
    }
    if (e4 !== 64 && e4 !== -1) {
      output += String.fromCharCode(c3);
    }
  }
  return output;
};

// The `exp` (ms) of a JWT, or null if it can't be read.
const jwtExpiresAt = (token?: string): number | null => {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1]));
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
};

// The effective expiry: the earliest of the access-token expiry and the
// id_token's own exp. The id_token is what authorizes CloudMatch, and it can
// expire before the access token, so we must refresh on whichever comes first.
const effectiveExpiresAt = (tokens: GfnTokens): number => {
  const idExp = jwtExpiresAt(tokens.idToken);
  return idExp ? Math.min(tokens.expiresAt, idExp) : tokens.expiresAt;
};

// The `sub` claim of a JWT (NVIDIA's own user id) -- refreshWithClientToken()
// needs it and it's already sitting in the id/access token, no extra
// userinfo round trip required.
const jwtSub = (token?: string): string | null => {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1]));
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
};

// Multiple call sites (the library screen's owned-games load, a stream launch,
// ...) can call getValidTokens() within milliseconds of each other. If both
// see the same near-expiry token and independently call refreshAuthTokens(),
// and NVIDIA rotates refresh tokens (issuing a new one and invalidating the
// old on each use — standard for public OAuth clients), the loser's refresh
// token has already been consumed by the winner and its request fails. Share
// one in-flight refresh across concurrent callers so only one request is ever
// made for a given stale token.
let inFlightRefresh: Promise<Record<string, any>> | null = null;

// Client-token grant first (NVIDIA's real long-session mechanism -- see
// requestClientToken()/refreshWithClientToken() above), falling back to the
// plain refresh_token grant, matching OpenNOW's own working order exactly.
const refreshWithBestMethod = async (
  tokens: GfnTokens,
): Promise<Record<string, any>> => {
  if (tokens.clientToken) {
    const userId = jwtSub(tokens.idToken) ?? jwtSub(tokens.accessToken);
    if (userId) {
      try {
        return await refreshWithClientToken(
          tokens.clientToken,
          userId,
          tokens.authClientId,
        );
      } catch {
        // Fall through to the refresh_token grant below.
      }
    }
  }
  if (!tokens.refreshToken) {
    throw new Error('No refresh token or client token available');
  }
  const refreshed = await refreshAuthTokens(
    tokens.refreshToken,
    tokens.authClientId,
  );
  return {
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken,
    id_token: refreshed.idToken,
    client_token: refreshed.clientToken,
    expires_in: Math.round((refreshed.expiresAt - Date.now()) / 1000),
  };
};

const refreshOnce = (tokens: GfnTokens): Promise<Record<string, any>> => {
  if (!inFlightRefresh) {
    inFlightRefresh = refreshWithBestMethod(tokens).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
};

// Best-effort, fire-and-forget: get a client token if this session doesn't
// have one yet (or its own is close to expiring), using the still-valid
// access token. Deliberately not awaited by getValidTokens()'s fast path --
// this just needs to happen at some point while the access token is good, so
// a client token is already on hand once a refresh is actually due.
let inFlightClientTokenBootstrap: Promise<void> | null = null;

const bootstrapClientToken = (tokens: GfnTokens): void => {
  const hasUsable =
    !!tokens.clientToken &&
    (tokens.clientTokenExpiresAt ?? 0) - Date.now() >
      CLIENT_TOKEN_REFRESH_WINDOW_MS;
  if (hasUsable || inFlightClientTokenBootstrap) {
    return;
  }
  inFlightClientTokenBootstrap = requestClientToken(tokens.accessToken)
    .then(({clientToken, clientTokenExpiresAt}) => {
      // Re-read in case a refresh completed while this was in flight --
      // never clobber a newer token set with a client token grafted onto
      // the stale one this call started with.
      const current = getStoredTokens();
      if (current && current.accessToken === tokens.accessToken) {
        setStoredTokens({...current, clientToken, clientTokenExpiresAt});
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlightClientTokenBootstrap = null;
    });
};

// Return a valid token set, refreshing (and re-persisting) if it is expired or
// close to it. Returns null only when there is no session, or the current
// tokens have actually expired and a refresh could not get fresh ones.
export const getValidTokens = async (): Promise<GfnTokens | null> => {
  const tokens = getStoredTokens();
  if (!tokens) {
    return null;
  }
  const expiry = effectiveExpiresAt(tokens);
  if (expiry - Date.now() > REFRESH_WINDOW_MS) {
    bootstrapClientToken(tokens);
    return tokens;
  }
  if (!tokens.refreshToken && !tokens.clientToken) {
    return expiry > Date.now() ? tokens : null;
  }
  try {
    const refreshed = await refreshOnce(tokens);
    // Preserve an id/client token the refresh response may omit — but never
    // keep a stale id_token that has already expired (fall back to the access
    // token instead), and re-persist so the next call sees the fresh set.
    const oldIdValid = (jwtExpiresAt(tokens.idToken) ?? 0) > Date.now();
    const merged: GfnTokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      idToken: refreshed.id_token ?? (oldIdValid ? tokens.idToken : undefined),
      clientToken: refreshed.client_token ?? tokens.clientToken,
      clientTokenExpiresAt: refreshed.client_token
        ? undefined
        : tokens.clientTokenExpiresAt,
      expiresAt: toExpiresAt(refreshed.expires_in),
      authClientId: tokens.authClientId,
    };
    setStoredTokens(merged);
    return merged;
  } catch {
    // Refresh failed — a transient/network error, or this call lost a race
    // against a concurrent refresh that already consumed the same refresh
    // token. If the tokens we already have haven't actually expired yet, keep
    // using them instead of forcing a sign-out; the next call retries.
    return expiry > Date.now() ? tokens : null;
  }
};

// The JWT to authorize GeForce NOW services (CloudMatch, GraphQL). NVIDIA's
// clients send the OpenID id_token as `GFNJWT <token>`; fall back to the access
// token only if no id_token is present.
export const getValidGfnJwt = async (): Promise<string | null> => {
  const tokens = await getValidTokens();
  if (!tokens) {
    return null;
  }
  return tokens.idToken ?? tokens.accessToken;
};

// Return a usable access token (OAuth access_token), refreshing if needed.
export const getValidAccessToken = async (): Promise<string | null> => {
  const tokens = await getValidTokens();
  return tokens ? tokens.accessToken : null;
};
