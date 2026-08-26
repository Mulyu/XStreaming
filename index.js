/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './src/App';
import CoverScreen from './src/pages/CoverScreen';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
// Component shown on a foldable cover display by the CoverDisplay PoC.
AppRegistry.registerComponent('XCoverScreen', () => CoverScreen);
