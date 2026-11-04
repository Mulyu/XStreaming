module.exports = {
  preset: 'react-native',
  // react-native-gesture-handler needs its native module; this is its own mock.
  setupFiles: [
    './node_modules/react-native-gesture-handler/jestSetup.js',
    './jest.setup.js',
  ],
  // Images inside node_modules (e.g. react-navigation's back icon) are not
  // transformed by the preset, so stub them.
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
  // The preset only transforms .js/.ts/.tsx; some of our files are .jsx.
  transform: {'^.+\\.jsx$': 'babel-jest'},
  // Several dependencies ship untranspiled ES modules (react-redux,
  // react-native-splash-screen, ...), so transform everything except the
  // packages that are plain CommonJS and large.
  transformIgnorePatterns: [
    'node_modules/(react-test-renderer|react|scheduler|jest-[^/]+|@babel|core-js[^/]*|lodash)/',
  ],
};
