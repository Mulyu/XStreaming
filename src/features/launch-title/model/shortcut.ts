import {storage} from '../../../shared/lib/mmkv';
import {getXcloudData} from '../../../entities/catalog-title';

const STORE_KEY = 'user.titleShortcuts';
// Separate from xCloud's own STORE_KEY (not just a different id namespace
// within it) so a productId format collision between an Xbox title and a PS
// Plus CloudGame can never overwrite the other provider's snapshot.
const PSPLUS_STORE_KEY = 'user.psplus.titleShortcuts';

const normalizeId = (value: any) => {
  return typeof value === 'string' ? value.trim() : '';
};

export const getTitleProductId = (titleItem: any) => {
  return normalizeId(
    titleItem?.productId || titleItem?.ProductId || titleItem?.ProductID,
  );
};

export const getTitleStreamingId = (titleItem: any) => {
  return normalizeId(titleItem?.titleId || titleItem?.XCloudTitleId);
};

const readSnapshotMap = (storeKey: string) => {
  const data = storage.getString(storeKey);
  if (!data) {
    return {};
  }

  try {
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
};

const saveSnapshotToStore = (
  storeKey: string,
  productId: string,
  value: any,
) => {
  if (!productId) {
    return;
  }

  const map = readSnapshotMap(storeKey);
  map[productId] = value;
  map[productId.toUpperCase()] = value;
  storage.set(storeKey, JSON.stringify(map));
};

export const saveTitleShortcutSnapshot = (titleItem: any) => {
  saveSnapshotToStore(STORE_KEY, getTitleProductId(titleItem), titleItem);
};

// PS Plus's CloudGame object is already everything PsPlusStream needs to
// relaunch (unlike xCloud's raw title, nothing has to be freshly refetched
// off it), so -- like xCloud, and unlike GFN, which needs no lookup at all --
// this is the sole source of truth at open time; there's no separate "live
// catalog cache" helper for PS Plus the way getXcloudData() is for xCloud
// that features/launch-title could reach without a layering violation.
export const savePsPlusTitleShortcutSnapshot = (game: any) => {
  saveSnapshotToStore(PSPLUS_STORE_KEY, getTitleProductId(game), game);
};

const findTitleInMap = (titleMap: any, productId: string) => {
  if (!titleMap || !productId) {
    return null;
  }

  return titleMap[productId] || titleMap[productId.toUpperCase()] || null;
};

const findTitleInList = (titles: any[], productId: string) => {
  if (!Array.isArray(titles) || !productId) {
    return null;
  }

  const upperProductId = productId.toUpperCase();
  return (
    titles.find(item => {
      const itemProductId = getTitleProductId(item);
      return itemProductId && itemProductId.toUpperCase() === upperProductId;
    }) || null
  );
};

export const findTitleByProductId = (productId: any) => {
  const safeProductId = normalizeId(productId);
  if (!safeProductId) {
    return null;
  }

  const cacheData = getXcloudData();
  const titleFromCache =
    findTitleInMap(cacheData?.titleMap, safeProductId) ||
    findTitleInList(cacheData?.titles, safeProductId);
  if (titleFromCache) {
    return titleFromCache;
  }

  return findTitleInMap(readSnapshotMap(STORE_KEY), safeProductId);
};

export const findPsPlusGameByProductId = (productId: any) => {
  const safeProductId = normalizeId(productId);
  if (!safeProductId) {
    return null;
  }

  return findTitleInMap(readSnapshotMap(PSPLUS_STORE_KEY), safeProductId);
};

// ---- Provider-agnostic "add to home screen" request ----
//
// xCloud and GFN launch NativeStream with different params (see
// features/launch-title), so a shortcut has to carry enough of its own
// provider's identifiers to relaunch directly into the right one -- it
// can't reuse a single generic id/lookup the way the
// xCloud-only shortcut this replaces did. xCloud still resolves through
// findTitleByProductId at open time (see App.tsx) since TitleDetail needs
// the full raw title object; GFN doesn't need a lookup at all, since
// NativeStream only ever needed {appId, title} to start streaming.
export type TitleShortcutSnapshot =
  | {provider: 'xcloud'; titleItem: any}
  | {provider: 'psplus'; game: any}
  | {
      provider: 'gfn';
      appId: string;
      store: string;
      title: string;
      imageUrl?: string;
    };

const xcloudIconUrl = (titleItem: any): string => {
  const artworkUrl =
    titleItem?.Image_Poster?.URL || titleItem?.Image_Tile?.URL || '';
  return artworkUrl ? `https:${artworkUrl}` : '';
};

// The exact payload ShortcutManager.addTitleShortcut (native) expects --
// kept in one place so every caller (TitleDetail, LibraryTitleDetail, ...)
// builds it the same way regardless of provider.
export const buildShortcutRequest = (snapshot: TitleShortcutSnapshot) => {
  if (snapshot.provider === 'gfn') {
    return {
      provider: 'gfn',
      gfnAppId: snapshot.appId,
      gfnStore: snapshot.store,
      titleName: snapshot.title,
      iconUrl: snapshot.imageUrl || '',
    };
  }

  if (snapshot.provider === 'psplus') {
    savePsPlusTitleShortcutSnapshot(snapshot.game);
    const productId = getTitleProductId(snapshot.game);
    return {
      provider: 'psplus',
      productId,
      titleName: snapshot.game?.name || productId,
      // Unlike xCloud's Image_Poster.URL, CloudGame.imageUrl is already a
      // full absolute URL (see entities/catalog-title's psplus builders) --
      // xcloudIconUrl()'s "https:" prefix would double up into a broken
      // "https://https://..." URL here, so this is passed through as-is.
      iconUrl: snapshot.game?.imageUrl || '',
    };
  }

  saveTitleShortcutSnapshot(snapshot.titleItem);
  const productId = getTitleProductId(snapshot.titleItem);
  return {
    provider: 'xcloud',
    productId,
    titleId: getTitleStreamingId(snapshot.titleItem),
    xCloudTitleId: snapshot.titleItem?.XCloudTitleId || '',
    titleName: snapshot.titleItem?.ProductTitle || productId,
    iconUrl: xcloudIconUrl(snapshot.titleItem),
  };
};

// Shared "add to home screen" flow for every provider -- resolves/rejects
// exactly like the native call itself; callers only need to turn the result
// into UI feedback (toast on success, Alert on failure).
export const requestTitleShortcut = (
  shortcutManager: any,
  snapshot: TitleShortcutSnapshot,
): Promise<{requested: boolean; shortcutId: string}> => {
  if (!shortcutManager?.addTitleShortcut) {
    return Promise.reject(
      Object.assign(new Error('Shortcuts are not supported here'), {
        code: 'SHORTCUT_UNSUPPORTED',
      }),
    );
  }
  return shortcutManager.addTitleShortcut(buildShortcutRequest(snapshot));
};
