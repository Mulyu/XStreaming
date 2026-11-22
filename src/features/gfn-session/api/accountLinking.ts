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
// Unlike CloudMatch/GraphQL, which take the OpenID id_token as `GFNJWT
// <token>`, this service's own createHeader() sends a plain OAuth `Bearer
// <token>` -- so this needs the access_token specifically (see
// entities/gfn-account's getValidTokens()), not getValidGfnJwt()'s
// id_token-preferring value.
//
// NOT verified against a live account at the time this was written: the
// endpoint, method and auth scheme are read directly out of the official
// client's own source, but the exact `platform` path segment GFN expects for
// Steam (tried here as "steam", the lowercase REST convention) was not
// confirmed against a real response. The HTTP status syncGfnStoreConnection
// returns is the signal to go by if it needs correcting.
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
  accessToken: string,
): Promise<GfnStoreSyncResult> => {
  try {
    const response = await fetch(`${ALS_BASE_URL}/sync/${platform}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    return {ok: response.status === 202, status: response.status};
  } catch {
    return {ok: false, status: 0};
  }
};
