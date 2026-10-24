import {NativeModules, Platform} from 'react-native';
import {storage} from '../../../shared/lib/mmkv';
import {palette} from '../../../shared/config/palette';
import {buildShortcutRequest, TitleShortcutSnapshot} from './shortcut';
import {pushRecent, RecentLaunch} from './recentList';

const STORE_KEY = 'user.recentLaunches';

const readRecent = (): RecentLaunch[] => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Hands the list to the Android home-screen widget (a no-op elsewhere). The
// second argument is the colour for the widget's empty slots, taken from the
// palette so the native side never needs its own copy.
const syncWidget = (items: RecentLaunch[]) => {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    NativeModules.HomeWidget?.setRecentTitles(items, palette.textDim);
  } catch {}
};

// Called at every launch path. Building the shortcut request also saves the
// snapshot a later direct launch resolves the title from, so a widget tap
// never hits "shortcut expired".
export const recordRecentLaunch = (snapshot: TitleShortcutSnapshot): void => {
  try {
    const entry = buildShortcutRequest(snapshot) as RecentLaunch;
    const next = pushRecent(readRecent(), entry);
    storage.set(STORE_KEY, JSON.stringify(next));
    syncWidget(next);
  } catch {}
};
