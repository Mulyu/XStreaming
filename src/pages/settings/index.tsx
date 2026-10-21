import React from 'react';
import {useSettingsScreen} from './model/useSettingsScreen';
import SettingsView from './ui/SettingsView';

function SettingsScreen({navigation, route}) {
  const vm = useSettingsScreen(navigation, route);
  return <SettingsView {...vm} />;
}

export default SettingsScreen;
