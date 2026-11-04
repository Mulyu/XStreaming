/* eslint-env jest */
// Native modules the full <App /> pulls in; each one is replaced by a stub.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock('react-native-splash-screen', () => ({
  __esModule: true,
  default: {show: jest.fn(), hide: jest.fn()},
}));
jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {getString: jest.fn(), setString: jest.fn()},
}));
jest.mock('react-native-restart', () => ({
  __esModule: true,
  default: {Restart: jest.fn()},
}));
jest.mock('react-native-orientation-locker', () => ({
  __esModule: true,
  default: {
    lockToPortrait: jest.fn(),
    lockToLandscape: jest.fn(),
    unlockAllOrientations: jest.fn(),
    addOrientationListener: jest.fn(),
    removeOrientationListener: jest.fn(),
    getOrientation: jest.fn(),
  },
  OrientationType: {},
}));
jest.mock('react-native-background-timer', () => ({
  __esModule: true,
  default: {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id),
  },
}));
jest.mock('@react-native-cookies/cookies', () => ({
  __esModule: true,
  default: {get: jest.fn(), set: jest.fn(), clearAll: jest.fn()},
}));
jest.mock('react-native-webrtc', () => ({
  RTCView: 'RTCView',
  mediaDevices: {},
  RTCPeerConnection: jest.fn(),
}));
jest.mock('react-native-webview', () => ({
  __esModule: true,
  default: 'WebView',
  WebView: 'WebView',
}));
jest.mock('react-native-edge-to-edge', () => ({
  SystemBars: 'SystemBars',
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The app is Android-only (phone and TV); the iOS-only checks in React
// Native's own modules (e.g. NativeEventEmitter needing a native module)
// would otherwise fire for our Android-only native modules.
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const actual = jest.requireActual(
    'react-native/Libraries/Utilities/Platform',
  );
  return {
    ...actual,
    OS: 'android',
    isTV: false,
    select: spec => ('android' in spec ? spec.android : spec.default),
  };
});

// The app's own Android native modules. Every method is a stub that resolves
// to undefined, which is enough for the app to mount.
const {NativeModules} = require('react-native');
const nativeStub = () => {
  const methods = {};
  return new Proxy(methods, {
    get: (target, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') {
        return undefined;
      }
      if (!(prop in target)) {
        target[prop] = jest.fn(() => Promise.resolve(undefined));
      }
      return target[prop];
    },
  });
};
[
  'AppDebugLog',
  'AudioSettingModule',
  'BatteryModule',
  'CoverDisplayManager',
  'FullScreenManager',
  'GamepadManager',
  'HomeWidget',
  'PhysicalInput',
  'PsPlusChiaki',
  'ShortcutManager',
  'StreamKeepAliveManager',
  'UpdateManager',
  'UsbRumbleManager',
  'XalManager',
].forEach(name => {
  NativeModules[name] = nativeStub();
});
