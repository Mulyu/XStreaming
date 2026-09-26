import React from 'react';
import {useCustomGamepad} from './model/useCustomGamepad';
import CustomGamepadView from './ui/CustomGamepadView';

function CustomGamepadScreen({navigation, route}) {
  const vm = useCustomGamepad(navigation, route);
  return <CustomGamepadView {...vm} />;
}

export default CustomGamepadScreen;
