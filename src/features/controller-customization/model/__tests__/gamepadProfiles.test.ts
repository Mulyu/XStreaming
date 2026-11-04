const mem: Record<string, string> = {};
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {
    getString: (k: string) => mem[k],
    set: (k: string, v: string) => {
      mem[k] = v;
    },
    delete: (k: string) => {
      delete mem[k];
    },
  },
}));

import {
  DEFAULT_PROFILE,
  ensureGameProfile,
  getDefaultProfile,
  resetGameProfile,
} from '../gamepadProfiles';
import {
  getSettings as getLayouts,
  saveSettings as saveLayout,
} from '../virtualGamepadLayout';
import {
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
} from '../touchProfile';
import {getCoverLayout, saveCoverLayout} from '../coverLayout';

const reset = () => Object.keys(mem).forEach(k => delete mem[k]);

const button = (name: string, x: number) => ({name, x, y: 0, show: true});

describe('gamepad profiles', () => {
  beforeEach(reset);

  it('drops the profiles made by hand under the old scheme, once', () => {
    saveLayout('My profile', [button('A', 1)]);
    setSwipeConfig('My profile', {
      sensitivity: 5,
      invertY: true,
      activation: 4,
      acceleration: 0,
    });
    mem['user.gameLastProfile'] = JSON.stringify({g: 'My profile'});

    expect(getDefaultProfile()).toBe(DEFAULT_PROFILE);
    expect(getLayouts()['My profile']).toBeUndefined();
    expect(getSwipeConfig('My profile').sensitivity).toBe(0);
    expect(mem['user.gameLastProfile']).toBeUndefined();

    // Customizing the default afterwards is not wiped by a second call.
    saveLayout(DEFAULT_PROFILE, [button('A', 2)]);
    getDefaultProfile();
    expect(getLayouts()[DEFAULT_PROFILE]).toEqual([button('A', 2)]);
  });

  it('gives a game its own copy of the default on first launch', () => {
    getDefaultProfile();
    saveLayout(DEFAULT_PROFILE, [button('A', 10)]);
    setSwipeConfig(DEFAULT_PROFILE, {
      sensitivity: 3,
      invertY: false,
      activation: 1,
      acceleration: 2,
    });
    setJoystickMode(DEFAULT_PROFILE, 0);
    saveCoverLayout(DEFAULT_PROFILE, [
      {name: 'LeftTrigger', label: 'LT', x: 0.1, y: 0.1, size: 0.2, show: true},
    ]);

    const name = ensureGameProfile('xcloud:abc');
    expect(name).not.toBe(DEFAULT_PROFILE);
    expect(getLayouts()[name]).toEqual([button('A', 10)]);
    expect(getSwipeConfig(name)).toMatchObject({sensitivity: 3, activation: 1});
    expect(getJoystickMode(name)).toBe(0);
    expect(getCoverLayout(name)[0].x).toBe(0.1);
  });

  it('keeps a game independent of the default and of other games afterwards', () => {
    getDefaultProfile();
    saveLayout(DEFAULT_PROFILE, [button('A', 10)]);
    const first = ensureGameProfile('gfn:1');
    const second = ensureGameProfile('gfn:2');

    saveLayout(first, [button('A', 99)]);
    saveLayout(DEFAULT_PROFILE, [button('A', 55)]);

    // Launching again returns the game's own profile, untouched by either.
    expect(ensureGameProfile('gfn:1')).toBe(first);
    expect(getLayouts()[first]).toEqual([button('A', 99)]);
    expect(getLayouts()[second]).toEqual([button('A', 10)]);
    // A game launched for the first time now copies the changed default.
    const third = ensureGameProfile('gfn:3');
    expect(getLayouts()[third]).toEqual([button('A', 55)]);
  });

  it('leaves a game on the built-in layout when the default was never customized', () => {
    const name = ensureGameProfile('gfn:9');
    expect(getLayouts()[name]).toBeUndefined();
    // ...and a later default edit does not reach it.
    saveLayout(DEFAULT_PROFILE, [button('A', 1)]);
    expect(ensureGameProfile('gfn:9')).toBe(name);
    expect(getLayouts()[name]).toBeUndefined();
  });

  it('resets a game to the default as it is now', () => {
    getDefaultProfile();
    saveLayout(DEFAULT_PROFILE, [button('A', 10)]);
    const name = ensureGameProfile('gfn:1');
    saveLayout(name, [button('A', 99)]);
    setSwipeConfig(name, {
      sensitivity: 9,
      invertY: true,
      activation: 4,
      acceleration: 0,
    });

    expect(resetGameProfile('gfn:1')).toBe(name);
    expect(getLayouts()[name]).toEqual([button('A', 10)]);
    expect(getSwipeConfig(name).sensitivity).toBe(0);
  });

  it('falls back to the default itself when there is no game key', () => {
    expect(ensureGameProfile('')).toBe(DEFAULT_PROFILE);
    expect(resetGameProfile('')).toBe(DEFAULT_PROFILE);
  });
});
