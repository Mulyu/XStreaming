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
// getValidGfnJwt() prefers). Use getValidGfnJwt()'s value (or
// getValidTokens().idToken) here, not .accessToken.
//
// Both confirmed live against a real account: the id_token fix alone turned
// a 401 into a 400 with body {"error":"service_error","description":"...
// Platform steam not supported"} -- the lowercase platform segment this file
// originally guessed (the usual REST convention) isn't what GFN expects.
// Its own catalog API already answered this elsewhere in the app
// (entities/catalog-title's gfnCatalog.ts compares store names as
// `store.toUpperCase() === 'STEAM'`): the platform segment GFN's own
// "digital store" list literally uses, uppercase, which answered 202.
const ALS_BASE_URL = 'https://als.geforcenow.com/v1';

// Whatever store id GFN's own account-linking data returns (entities/
// catalog-title's fetchGfnLinkedStores) IS this platform argument -- the
// web client's own accountProviders map is keyed by that same field
// (`jt.store`) and feeds it straight into this same sync call, uppercase
// and all, with no per-store translation step anywhere in between. Steam's
// case ("STEAM") is the only one confirmed live; this isn't typed to a
// literal union of known-good values because the whole point of that
// mechanism is that it's generic across whichever stores a given account
// actually has linked.
export type GfnStorePlatform = string;

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
