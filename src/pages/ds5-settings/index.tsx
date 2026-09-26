import React from 'react';
import {useDs5Settings} from './model/useDs5Settings';
import Ds5SettingsView from './ui/Ds5SettingsView';

function Ds5SettingsScreen({navigation, route}) {
  const vm = useDs5Settings(navigation, route);
  return <Ds5SettingsView {...vm} />;
}

export default Ds5SettingsScreen;
