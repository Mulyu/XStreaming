import React from 'react';
import {useSettingsScreen} from './model/useSettingsScreen';
import SettingsView from './ui/SettingsView';

function SettingsScreen({navigation}) {
  const vm = useSettingsScreen(navigation);
  return <SettingsView {...vm} />;
}

export default SettingsScreen;
