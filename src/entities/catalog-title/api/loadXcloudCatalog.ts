import XcloudCatalogApi from './xcloudCatalogApi';
import {storage} from '../../../shared/lib/mmkv';

// Tracks whether the signed-in user's xCloud catalog last loaded
// successfully. getTitles()/getGamePassProducts() (see xcloudCatalogApi.ts)
// both swallow their own network failures into an empty result, which on its own
// is indistinguishable from "this account genuinely has 0 entitlements" --
// this wrapper tells the two apart so the Settings screen can show a real
// status instead of always reading as empty.
//
// Unlike GFN's full catalog (fetchGfnFullCatalog in gfn/catalog.ts), xCloud's
// own catalog is fetched in one shot per stage (no page-by-page cursor that
// can get cut off partway), so there's no partial/complete distinction to
// make here -- only "failed", "no entitlements", or "loaded".
export type XcloudCatalogStatus = {
  ts: number;
  state: 'failed' | 'empty' | 'loaded';
  entitledCount: number;
  hydratedCount: number;
};

const STATUS_KEY = 'xcloud.catalog.status';

export const getXcloudCatalogStatus = (): XcloudCatalogStatus | null => {
  const raw = storage.getString(STATUS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.ts === 'number' ? parsed : null;
  } catch {
    return null;
  }
};

const setXcloudCatalogStatus = (status: XcloudCatalogStatus): void => {
  try {
    storage.set(STATUS_KEY, JSON.stringify(status));
  } catch {}
};

export const clearXcloudCatalogStatus = (): void => {
  try {
    storage.delete(STATUS_KEY);
  } catch {}
};

// Load the signed-in user's full entitled xCloud catalog (title list + Game
// Pass hydration), recording whether the fetch itself succeeded. Used by
// both Library.tsx (on mount/refresh) and Settings.tsx (manual reload), so
// the status this persists reflects whichever loaded most recently.
export const loadXcloudCatalog = async (
  xCloudToken: any,
): Promise<{titles: any[]; status: XcloudCatalogStatus}> => {
  const api = new XcloudCatalogApi(
    xCloudToken.getDefaultRegion().baseUri,
    xCloudToken.data.gsToken,
  );
  const res: any = await api.getTitles();
  // getTitles() resolves the raw {results: [...]} response on success, but
  // collapses any request failure to a bare [] -- the two are otherwise
  // indistinguishable, so check the shape rather than just the length.
  const entitled = Array.isArray(res) ? null : res?.results;
  if (!Array.isArray(entitled)) {
    const status: XcloudCatalogStatus = {
      ts: Date.now(),
      state: 'failed',
      entitledCount: 0,
      hydratedCount: 0,
    };
    setXcloudCatalogStatus(status);
    return {titles: [], status};
  }
  if (entitled.length === 0) {
    const status: XcloudCatalogStatus = {
      ts: Date.now(),
      state: 'empty',
      entitledCount: 0,
      hydratedCount: 0,
    };
    setXcloudCatalogStatus(status);
    return {titles: [], status};
  }
  const hydrated = await api.getGamePassProducts(entitled);
  const titles = Array.isArray(hydrated) ? hydrated : [];
  const status: XcloudCatalogStatus = {
    ts: Date.now(),
    state: 'loaded',
    entitledCount: entitled.length,
    hydratedCount: titles.length,
  };
  setXcloudCatalogStatus(status);
  return {titles, status};
};
