const mockStore = new Map<string, string>();
jest.mock('../mmkv', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v),
  },
}));
jest.mock('../locale', () => ({getSystemLocale: () => 'en-US'}));

import {getSettings, getSettingsCached, saveSettings} from '../settings';

describe('getSettingsCached', () => {
  beforeEach(() => mockStore.clear());

  it('reuses the parsed object while the stored string is unchanged', () => {
    saveSettings({...getSettings(), dead_zone: 0.2});
    const first = getSettingsCached();
    expect(getSettingsCached()).toBe(first);
    expect(first.dead_zone).toBe(0.2);
  });

  it('sees a later save', () => {
    saveSettings({...getSettings(), dead_zone: 0.2});
    const first = getSettingsCached();
    saveSettings({...getSettings(), dead_zone: 0.4});
    const second = getSettingsCached();
    expect(second).not.toBe(first);
    expect(second.dead_zone).toBe(0.4);
  });
});
