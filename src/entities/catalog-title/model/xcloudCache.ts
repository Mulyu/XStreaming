import {storage} from '../../../shared/lib/mmkv';
import {debugFactory} from '../../../shared/lib/debug';
const log = debugFactory('xcloudStore');

const STORE_KEY = 'user.xcloud';

// Sample
// const data = {
//   titles: [],
//   titleMap: {},
//   newTitles: [],
//   recentTitles: [],
//   starTitles: [],
//   cacheTime: 1755052925902
// };

export const saveXcloudData = (data: any) => {
  log.info('saveXcloudData');
  data = Object.assign({}, data);
  data.cacheTime = new Date().getTime();
  try {
    storage.set(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    storage.set(STORE_KEY, JSON.stringify({}));
  }
};

// The blob holds the whole xCloud title list, so it is large: parse it once
// per stored value rather than on every read (the Library reads it several
// times while mounting). The returned object is shared -- callers copy
// (`{...getXcloudData(), x}`) rather than mutate it.
let parsedRaw: string | undefined;
let parsedData: any = null;

export const getXcloudData = (): any => {
  const data = storage.getString(STORE_KEY);
  if (!data) {
    return null;
  }
  if (data === parsedRaw) {
    return parsedData;
  }
  try {
    parsedData = JSON.parse(data) as any;
    parsedRaw = data;
    return parsedData;
  } catch {
    return null;
  }
};

export const clearXcloudData = () => {
  const starTitles = getXcloudData()?.starTitles || [];
  storage.set(STORE_KEY, JSON.stringify({starTitles}));
};

// How long a stored title list is reused before the Library/Store fetch the
// entitled catalog again (purchases and Game Pass changes show up within this;
// pull-to-refresh and the Settings reload bypass it).
export const XCLOUD_TITLES_TTL_MS = 6 * 60 * 60 * 1000;

// Stores the entitled title list together with when it was fetched --
// `cacheTime` moves on every save of the blob (release dates too), so it can't
// say how old the list itself is.
export const saveXcloudTitles = (titles: any[]) => {
  saveXcloudData({...getXcloudData(), titles, titlesAt: Date.now()});
};

export const isXcloudTitlesFresh = (): boolean => {
  const data = getXcloudData();
  return (
    Array.isArray(data?.titles) &&
    data.titles.length > 0 &&
    typeof data.titlesAt === 'number' &&
    Date.now() - data.titlesAt < XCLOUD_TITLES_TTL_MS
  );
};
