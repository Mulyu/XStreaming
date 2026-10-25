import {storage} from '../../../shared/lib/mmkv';
import {DEFAULT_BINDINGS, InputBindings, sanitizeBindings} from './bindings';

const STORE_KEY = 'user.inputBindings';

export const getInputBindings = (): InputBindings => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return DEFAULT_BINDINGS;
  }
  try {
    return sanitizeBindings(JSON.parse(raw));
  } catch {
    return DEFAULT_BINDINGS;
  }
};

export const saveInputBindings = (bindings: InputBindings): void => {
  try {
    storage.set(STORE_KEY, JSON.stringify(bindings));
  } catch {}
};

export const resetInputBindings = (): InputBindings => {
  try {
    storage.delete(STORE_KEY);
  } catch {}
  return DEFAULT_BINDINGS;
};
