import React from 'react';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {SvgXml} from 'react-native-svg';
import {useTheme} from 'react-native-paper';
import icons from '../common/virtualgp';
import {
  isMacroButtonName,
  macroButtonNumber,
  MACRO_ICON_KEY,
} from '../utils/virtualMacro';
import {colorizeMacroIconXml, normalizeHexColor} from '../utils/themeColor';

type Props = {
  name: string;
  style: any;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
};

const GamepadButton: React.FC<Props> = ({
  name,
  onPressIn,
  onPressOut,
  style,
}) => {
  const theme = useTheme();
  const primaryColor = normalizeHexColor(theme.colors.primary);
  const longPressGesture = Gesture.LongPress()
    .onStart(() => {
      onPressIn && onPressIn(name);
    })
    .onEnd(() => {
      onPressOut && onPressOut(name);
    })
    .minDuration(16);

  let width = 40;
  let height = 40;

  if (['A', 'B', 'X', 'Y'].indexOf(name) > -1) {
    width = 70;
    height = 70;
  }
  if (name === 'Nexus') {
    width = 60;
    height = 60;
  }
  if (isMacroButtonName(name)) {
    width = 60;
    height = 60;
  }

  const xml = isMacroButtonName(name)
    ? colorizeMacroIconXml(icons[MACRO_ICON_KEY], primaryColor)
    : icons[name];
  const badge = macroButtonNumber(name);

  return (
    <GestureDetector gesture={longPressGesture}>
      <TouchableOpacity style={style}>
        <SvgXml xml={xml} width={width} height={height} />
        {badge !== null && (
          <Text style={styles.macroBadge} pointerEvents="none">
            {badge}
          </Text>
        )}
      </TouchableOpacity>
    </GestureDetector>
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
