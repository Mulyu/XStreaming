// GeForce NOW's Account Linking Service (ALS) -- a different NVIDIA backend
// from CloudMatch/GraphQL (games.geforce.com), reached at als.geforcenow.com
// (the base URL itself comes from the official web client's own runtime
// config, shared/assets/config/config.json's accountLinking.server).
//
// Ported from the official web client's bundled source
// (play.geforcenow.com/mall/, main.*.js -- ALSService.providerSync /
// postRequestToSync): a POST to /v1/sync/<platform> is exactly what the
// "Refresh" button on play.geforcenow.com/mall/#/layout/settings/connections
// does per linked store -- it tells NVIDIA to re-check that store's library
// right now instead of waiting for its own periodic background sync, which
// is what actually picks up a purchase made directly on Steam (etc.) rather
// than through GFN.
//
// createHeader() sends this as a plain `Bearer <token>` rather than the
// `GFNJWT <token>` scheme CloudMatch/GraphQL use -- but the value itself is
// still the OpenID id_token, not the OAuth access_token: ALSService gets it
// via idmService.getAuthToken() -> starfleetService.getAuthToken(), which
// resolves to the session's `data.idToken` (same underlying value
// getValidGfnJwt() prefers). An earlier version of this file guessed it
// needed the access_token instead, which the real service answered with 401
// -- confirmed by decoding a captured idToken.payload offline and tracing
// this call chain through the bundle a second time; use getValidGfnJwt()'s
// value (or getValidTokens().idToken) here, not .accessToken.
//
// The exact `platform` path segment GFN expects for Steam (tried here as
// "steam", the lowercase REST convention) is still unconfirmed against a
// real response. The HTTP status syncGfnStoreConnection returns is the
// signal to go by if that needs correcting next.
const ALS_BASE_URL = 'https://als.geforcenow.com/v1';

export type GfnStorePlatform = 'steam';

// The official client waits this long (its own
// accountLinking.defaultSyncWaitInterval) after a successful sync request
// before checking whether the library actually changed -- the sync itself
// runs on NVIDIA's side, not synchronously in the response.
export const GFN_STORE_SYNC_WAIT_MS = 10_000;

export type GfnStoreSyncResult = {
  // true only for the 202 Accepted the web client itself treats as success.
  ok: boolean;
  status: number;
};

export const syncGfnStoreConnection = async (
  platform: GfnStorePlatform,
  idToken: string,
): Promise<GfnStoreSyncResult> => {
  try {
    const response = await fetch(`${ALS_BASE_URL}/sync/${platform}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    return {ok: response.status === 202, status: response.status};
  } catch {
    return {ok: false, status: 0};
  }
};
