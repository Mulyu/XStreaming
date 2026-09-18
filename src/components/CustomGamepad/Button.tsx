import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {useTheme} from 'react-native-paper';
import icons from '../../common/virtualgp';
import {
  isMacroButtonName,
  macroButtonNumber,
  MACRO_ICON_KEY,
} from '../../utils/virtualMacro';
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
  const badge = macroButtonNumber(name);

  return (
    <View style={style}>
      <SvgXml
        xml={
          isMacroButtonName(name)
            ? colorizeMacroIconXml(icons[MACRO_ICON_KEY], primaryColor)
            : icons[name]
        }
        width={width * scale}
        height={height * scale}
      />
      {badge !== null && (
        <Text style={styles.macroBadge} pointerEvents="none">
          {badge}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  macroBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
});

export default GamepadButton;
