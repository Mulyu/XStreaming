import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {useTheme} from 'react-native-paper';
import icons from '../../common/virtualgp';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../../utils/virtualMacro';
import {getButtonBaseSize} from '../../utils/gamepadLayout';
import {colorizeMacroIconXml, normalizeHexColor} from '../../utils/themeColor';

type Props = {
  name: string;
  width?: number;
  height?: number;
  scale: number;
  style?: any;
};

const GamepadButton: React.FC<Props> = ({name, scale = 1, style}) => {
  const theme = useTheme();
  const primaryColor = normalizeHexColor(theme.colors.primary);
  // Use the shared canonical base size so the editor draws each button at the
  // exact size the game renders it — otherwise the layout drifts.
  const {width, height} = getButtonBaseSize(name);

  return (
    <View style={style}>
      <SvgXml
        xml={
          name === VIRTUAL_MACRO_BUTTON_NAME
            ? colorizeMacroIconXml(icons[name], primaryColor)
            : icons[name]
        }
        width={width * scale}
        height={height * scale}
      />
    </View>
  );
};

export default GamepadButton;
