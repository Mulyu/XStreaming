import React from 'react';
import {useCustomGamepad} from './model/useCustomGamepad';
import {VirtualGamepadEditor} from '../../widgets/virtual-gamepad-editor';

function CustomGamepadScreen({navigation}) {
  const vm = useCustomGamepad(navigation);
  return <VirtualGamepadEditor {...vm} />;
}

export default CustomGamepadScreen;
