import React from 'react';
import Orientation from 'react-native-orientation-locker';
import {NativeModules} from 'react-native';
import {
  DEFAULT_PROFILE,
  getDefaultProfile,
  saveVirtualGamepadLayout,
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
  getSensorConfig,
  setSensorConfig,
} from '../../../features/controller-customization';
import type {
  ButtonConfig,
  SensorConfig,
  SwipeConfig,
} from '../../../features/controller-customization';

const {FullScreenManager} = NativeModules;

// The out-of-game touch-controller editor. It edits the default profile only:
// the one each game gets its own copy of the first time it is launched. A
// game's own profile is changed from inside that game. All the actual editing
// (buttons / swipe-aim / gyro-aim / stick mode / macros) lives in the shared
// VirtualGamepadEditor widget, the same one the in-game customization renders
// -- this model only supplies the default profile's settings and saves them.
export function useCustomGamepad(navigation: any) {
  const profileName = React.useMemo(() => getDefaultProfile(), []);

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

  const onSave = (
    buttons: ButtonConfig[],
    swipe: SwipeConfig,
    joystickMode: number,
    sensor: SensorConfig,
  ) => {
    saveVirtualGamepadLayout(DEFAULT_PROFILE, buttons);
    setSwipeConfig(DEFAULT_PROFILE, swipe);
    setJoystickMode(DEFAULT_PROFILE, joystickMode);
    setSensorConfig(DEFAULT_PROFILE, sensor);
    navigation.goBack();
  };

  const onCancel = () => navigation.goBack();

  const swipe = getSwipeConfig(profileName);

  return {
    visible: true,
    profileName,
    swipeSensitivity: swipe.sensitivity,
    swipeInvertY: swipe.invertY,
    swipeActivation: swipe.activation,
    swipeAcceleration: swipe.acceleration,
    joystickMode: getJoystickMode(profileName) ?? 1,
    sensorConfig: getSensorConfig(profileName),
    onSave,
    onCancel,
  };
}
