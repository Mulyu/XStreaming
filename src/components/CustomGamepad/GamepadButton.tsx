import React from 'react';
import ButtonView from '../ButtonView';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
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
  scale?: number;
  style: any;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
};

const mapping: any = {
  LeftTrigger: 'control_button_lt',
  RightTrigger: 'control_button_rt',
  LeftShoulder: 'control_button_lb',
  RightShoulder: 'control_button_rb',
  A: 'control_button_a',
  B: 'control_button_b',
  X: 'control_button_x',
  Y: 'control_button_y',
  LeftThumb: 'control_button_left_joystick_down',
  RightThumb: 'control_button_right_joystick_down',
  View: 'control_button_view',
  Nexus: 'control_button_xbox',
  Menu: 'control_button_menu',
  DPadUp: 'control_button_up',
  DPadLeft: 'control_button_left',
  DPadDown: 'control_button_down',
  DPadRight: 'control_button_right',
};

const GamepadButton: React.FC<Props> = ({
  name,
  scale = 1,
  onPressIn,
  onPressOut,
  style,
}) => {
  const theme = useTheme();
  const primaryColor = normalizeHexColor(theme.colors.primary);
  // Shared canonical base size — kept identical to the editor so a laid-out
  // button occupies the same rectangle when editing and when playing.
  const {width, height} = getButtonBaseSize(name);

  const mappedButtonName = mapping[name];
  if (!mappedButtonName) {
    const longPressGesture = Gesture.LongPress()
      .onStart(() => {
        onPressIn(name);
      })
      .onEnd(() => {
        onPressOut(name);
      })
      .minDuration(16);
    const badge = macroButtonNumber(name);

    return (
      <GestureDetector gesture={longPressGesture}>
        <TouchableOpacity
          style={[
            style,
            {
              width: width * scale,
              height: height * scale,
            },
          ]}>
          <SvgXml
            xml={
              isMacroButtonName(name)
                ? colorizeMacroIconXml(
                    icons[MACRO_ICON_KEY] ?? icons.Menu,
                    primaryColor,
                  )
                : icons[name] ?? icons.Menu
            }
            width={width * scale}
            height={height * scale}
          />
          {badge !== null && (
            <Text style={styles.macroBadge} pointerEvents="none">
              {badge}
            </Text>
          )}
        </TouchableOpacity>
      </GestureDetector>
    );
  }

  return (
    <ButtonView
      style={[
        style,
        {
          width: width * scale,
          height: height * scale,
        },
      ]}
      buttonName={mappedButtonName}
      onPressIn={() => onPressIn(name)}
      onPressOut={() => onPressOut(name)}
    />
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
