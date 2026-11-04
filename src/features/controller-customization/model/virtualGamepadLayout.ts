import {storage} from '../../../shared/lib/mmkv';
import {debugFactory} from '../../../shared/lib/debug';
const log = debugFactory('gamepadStore');

const STORE_KEY = 'user.vgamepad';

const defaultSettings: any = {};

export const saveSettings = (name: string, params: any) => {
  log.info('SaveSettings:', name, JSON.stringify(params));
  let settings: any = storage.getString(STORE_KEY);

  if (!settings) {
    settings = {};
  } else {
    try {
      settings = JSON.parse(settings);
    } catch (e) {
      settings = {};
    }
  }

  settings[name] = params;

  storage.set(STORE_KEY, JSON.stringify(settings));
};

export const deleteSetting = (name: string) => {
  log.info('deleteSetting:', name);
  let settings: any = storage.getString(STORE_KEY);

  if (!settings) {
    settings = {};
  } else {
    try {
      settings = JSON.parse(settings);
    } catch (e) {
      settings = {};
    }
  }

  delete settings[name];

  storage.set(STORE_KEY, JSON.stringify(settings));
};

export const getSettings = (): any => {
  let settings = storage.getString(STORE_KEY);
  if (!settings) {
    return defaultSettings;
  }
  try {
    const _settings = JSON.parse(settings);
    return _settings;
  } catch {
    return defaultSettings;
  }
};

// Gives `to` its own copy of `from`'s button layout (nothing when `from` has
// none saved, so `to` renders the built-in layout like `from` does).
export const copyLayout = (from: string, to: string) => {
  const settings = getSettings();
  const layout = settings[from];
  if (Array.isArray(layout)) {
    saveSettings(
      to,
      layout.map((button: any) => ({...button})),
    );
  } else if (settings[to] !== undefined) {
    deleteSetting(to);
  }
};

export const clearLayouts = () => storage.delete(STORE_KEY);
