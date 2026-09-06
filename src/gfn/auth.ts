import {storage} from '../store/mmkv';

// GeForce NOW device-code (QR) login. NVIDIA's Steam Deck client uses the OAuth
// 2.0 device-authorization grant, which is a great fit for a TV/handheld app:
// we show the user a short code + URL, they approve on their phone/PC, and we
// poll for tokens. Ported from OpenNOW (MIT) and adapted for React Native (no
// node crypto/os — the device id is a persisted random hex string instead).

const DEVICE_AUTHORIZE_ENDPOINT = 'https://login.nvidia.com/device/authorize';
const TOKEN_ENDPOINT = 'https://login.nvidia.com/token';

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

export type GfnTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  clientToken?: string;
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

// Return a valid token set, refreshing (and re-persisting) if it is expired or
// close to it. Returns null when there is no session or the refresh fails.
export const getValidTokens = async (): Promise<GfnTokens | null> => {
  const tokens = getStoredTokens();
  if (!tokens) {
    return null;
  }
  if (tokens.expiresAt - Date.now() > REFRESH_WINDOW_MS) {
    return tokens;
  }
  if (!tokens.refreshToken) {
    return tokens.expiresAt > Date.now() ? tokens : null;
  }
  try {
    const refreshed = await refreshAuthTokens(
      tokens.refreshToken,
      tokens.authClientId,
    );
    // Preserve an id/client token the refresh response may omit.
    const merged: GfnTokens = {
      ...refreshed,
      idToken: refreshed.idToken ?? tokens.idToken,
      clientToken: refreshed.clientToken ?? tokens.clientToken,
    };
    setStoredTokens(merged);
    return merged;
  } catch {
    return null;
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
