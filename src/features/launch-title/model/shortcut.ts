import {storage} from '../../../shared/lib/mmkv';
import {getXcloudData} from '../../../entities/catalog-title';

const STORE_KEY = 'user.titleShortcuts';

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

const readShortcutTitleMap = () => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return {};
  }

  try {
    return JSON.parse(data) || {};
  } catch {
    return {};
  }
};

export const saveTitleShortcutSnapshot = (titleItem: any) => {
  const productId = getTitleProductId(titleItem);
  if (!productId) {
    return;
  }

  const titleMap = readShortcutTitleMap();
  titleMap[productId] = titleItem;
  titleMap[productId.toUpperCase()] = titleItem;
  storage.set(STORE_KEY, JSON.stringify(titleMap));
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

  const shortcutTitleMap = readShortcutTitleMap();
  return findTitleInMap(shortcutTitleMap, safeProductId);
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
