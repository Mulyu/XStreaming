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

export const isxCloudDataValid = (data: any) => {
  if (!data) {
    return false;
  }
  const {cacheTime} = data;

  if (!cacheTime) {
    return false;
  }

  // Cache 15 days
  return new Date().getTime() - cacheTime < 15 * 24 * 60 * 1000;
};
