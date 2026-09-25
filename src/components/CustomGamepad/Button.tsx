import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {virtualButtonIcons as icons} from '../../entities/gamepad';
import {getButtonBaseSize} from '../../features/controller-customization';

type Props = {
  name: string;
  width?: number;
  height?: number;
  scale: number;
  style?: any;
};

const GamepadButton: React.FC<Props> = ({name, scale = 1, style}) => {
  // Use the shared canonical base size so the editor draws each button at the
  // exact size the game renders it — otherwise the layout drifts.
  const {width, height} = getButtonBaseSize(name);

  return (
    <View style={style}>
      <SvgXml xml={icons[name]} width={width * scale} height={height * scale} />
    </View>
  );
};

export default GamepadButton;
