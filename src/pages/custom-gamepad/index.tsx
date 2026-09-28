import React from 'react';
import {useCustomGamepad} from './model/useCustomGamepad';
import {VirtualGamepadEditor} from '../../widgets/virtual-gamepad-editor';

function CustomGamepadScreen({navigation, route}) {
  const vm = useCustomGamepad(navigation, route);
  return <VirtualGamepadEditor {...vm} />;
}

export default CustomGamepadScreen;
