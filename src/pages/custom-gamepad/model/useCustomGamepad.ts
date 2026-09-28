import React from 'react';
import Orientation from 'react-native-orientation-locker';
import {NativeModules, Dimensions} from 'react-native';
import {
  getVirtualGamepadLayouts,
  saveVirtualGamepadLayout,
  deleteVirtualGamepadLayout,
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
  getSensorConfig,
  setSensorConfig,
  buildDefaultLayout,
} from '../../../features/controller-customization';
import type {
  ButtonConfig,
  SensorConfig,
  SwipeConfig,
} from '../../../features/controller-customization';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../../../shared/lib/settings';

const {FullScreenManager} = NativeModules;

// The out-of-game (Settings-launched) touch-controller layout editor. Thin
// on purpose: all the actual editing (buttons/swipe-aim/gyro-aim/joystick
// mode/macros) lives in the shared VirtualGamepadEditor widget, the same
// component the in-stream quick-edit overlay renders -- this model only
// supplies its per-profile input props and persists what it saves.
export function useCustomGamepad(navigation: any, route: any) {
  const [profileName, setProfileName] = React.useState<string>(
    route.params?.name ?? '',
  );
  const [profiles, setProfiles] = React.useState<string[]>(() =>
    Object.keys(getVirtualGamepadLayouts()),
  );

  React.useEffect(() => {
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    return () => {
      // Re-lock to portrait rather than unlocking: unlockAllOrientations()
      // forces SCREEN_ORIENTATION_SENSOR, which ignores the OS rotation
      // lock and leaves the rest of the (portrait-only) app free-rotating
      // after leaving this screen.
      Orientation.lockToPortrait();
      FullScreenManager.immersiveModeOff();
    };
  }, []);

  const refreshProfiles = () =>
    setProfiles(Object.keys(getVirtualGamepadLayouts()));

  // Switching (or creating) a profile from inside the editor also makes it
  // the active one for gameplay -- mirrors the in-stream quick-editor's own
  // profile switch (see pages/native-stream/index.tsx's applyActiveProfile),
  // which is the behavior this screen is unifying with.
  const switchTo = (name: string) => {
    saveUserSettings({...getUserSettings(), custom_virtual_gamepad: name});
    setProfileName(name);
  };

  const onSwitchProfile = (name: string) => switchTo(name);

  const onCreateProfile = (rawName: string, copyFrom: string) => {
    const name = rawName.trim();
    if (!name) {
      return;
    }
    const layouts = getVirtualGamepadLayouts();
    if (!layouts[name]) {
      const source = copyFrom && layouts[copyFrom];
      const seed: ButtonConfig[] = Array.isArray(source)
        ? source.map((button: ButtonConfig) => ({...button}))
        : (() => {
            const {width, height} = Dimensions.get('window');
            return buildDefaultLayout(width, height);
          })();
      saveVirtualGamepadLayout(name, seed);
    }
    refreshProfiles();
    switchTo(name);
  };

  const onDeleteProfile = (name: string) => {
    if (!name) {
      return;
    }
    const userSettings = getUserSettings();
    if (userSettings.custom_virtual_gamepad === name) {
      saveUserSettings({...userSettings, custom_virtual_gamepad: ''});
    }
    deleteVirtualGamepadLayout(name);
    refreshProfiles();
    // Fall back to the built-in Default after removing the active profile.
    switchTo('');
  };

  const onSave = (
    buttons: ButtonConfig[],
    swipe: SwipeConfig,
    joystickMode: number,
    sensor: SensorConfig,
  ) => {
    saveVirtualGamepadLayout(profileName, buttons);
    setSwipeConfig(profileName, swipe);
    setJoystickMode(profileName, joystickMode);
    setSensorConfig(profileName, sensor);
    // A profile edited before anything was ever made active (e.g. the very
    // first customization) becomes the active one, same fallback the
    // in-stream editor's own save applies.
    const userSettings = getUserSettings();
    if (!userSettings.custom_virtual_gamepad && profileName) {
      saveUserSettings({...userSettings, custom_virtual_gamepad: profileName});
    }
    navigation.navigate('Main', {screen: 'Settings'});
  };

  const onCancel = () => navigation.navigate('VirtualGamepadSettings');

  return {
    visible: true,
    profileName,
    profiles,
    activeProfile: profileName,
    swipeSensitivity: getSwipeConfig(profileName).sensitivity,
    swipeInvertY: getSwipeConfig(profileName).invertY,
    swipeActivation: getSwipeConfig(profileName).activation,
    swipeAcceleration: getSwipeConfig(profileName).acceleration,
    joystickMode: getJoystickMode(profileName) ?? 1,
    sensorConfig: getSensorConfig(profileName),
    onSave,
    onCancel,
    onSwitchProfile,
    onCreateProfile,
    onDeleteProfile,
  };
}
