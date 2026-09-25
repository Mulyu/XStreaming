import React from 'react';
import {StyleSheet, View, Dimensions} from 'react-native';
import GamepadButton from './CustomGamepad/GamepadButton';
import AnalogStick from '../components/AnalogStick';
import {getVirtualGamepadLayouts as getSettings} from '../features/controller-customization';
import {
  createDefaultMacroLayoutButtons,
  ensureMacroLayoutButtons,
} from '../utils/virtualMacro';
import {buildDefaultLayout, SWIPE_AIM_NAME} from '../utils/gamepadLayout';

type Props = {
  title: string;
  opacity: number;
  joystickMode?: number;
  onPressIn: (name: string) => any;
  onPressOut: (name: string) => any;
  onStickMove: (id: string, position: any) => any;
  refreshKey?: number;
  // Names of the macro button(s), if any, currently auto-firing on repeat --
  // each is drawn with a static ring so it stays visible after the finger
  // lifts. More than one can be active at once, since macro buttons run
  // independently of each other.
  loopingMacroNames?: Set<string>;
};

const CustomVirtualGamepad: React.FC<Props> = ({
  title,
  opacity = 0.7,
  joystickMode,
  onPressIn,
  onPressOut,
  onStickMove,
  refreshKey = 0,
  loopingMacroNames,
}) => {
  const [buttons, setButtons] = React.useState<any>([]);
  // Per-profile override wins; fall back to Free.
  const joystick = joystickMode === 0 || joystickMode === 1 ? joystickMode : 1;

  const {width: clientW, height: clientH} = Dimensions.get('window');

  React.useEffect(() => {
    const _settings = getSettings();
    const {width, height} = Dimensions.get('window');
    const macroDefaultButtons = createDefaultMacroLayoutButtons(width, height);
    if (_settings[title]) {
      const exitButtons = _settings[title];
      setButtons(ensureMacroLayoutButtons(exitButtons, macroDefaultButtons));
    } else {
      setButtons(buildDefaultLayout(width, height));
    }
  }, [title, refreshKey]);

  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  const handleStickMove = (id: string, data: any) => {
    onStickMove && onStickMove(id, data);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {buttons.map((button: any) => {
        if (!button.show) {
          return null;
        }
        // The swipe-aim trackpad is captured by SwipeAimZone (rendered by the
        // stream screen), not drawn as a control here.
        if (button.name === SWIPE_AIM_NAME) {
          return null;
        }
        if (button.name === 'LeftStick') {
          if (joystick === 1) {
            return (
              <View
                key={button.name}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  zIndex: 9,
                  width: clientW * 0.5,
                  height: clientH,
                }}>
                <AnalogStick
                  style={{
                    width: clientW * 0.5,
                    height: clientH,
                  }}
                  radius={140}
                  handleRadius={80}
                  onStickChange={(data: any) => handleStickMove('left', data)}
                />
              </View>
            );
          } else {
            return (
              <View
                key={button.name}
                style={[
                  styles.button,
                  {top: button.y, left: button.x},
                  {opacity},
                ]}>
                <View style={styles.leftJs}>
                  <AnalogStick
                    style={styles.analogStick}
                    radius={140}
                    handleRadius={80}
                    onStickChange={(data: any) => handleStickMove('left', data)}
                  />
                </View>
              </View>
            );
          }
        } else if (button.name === 'RightStick') {
          if (joystick === 1) {
            return (
              <View
                key={button.name}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  zIndex: 9,
                  width: clientW * 0.5,
                  height: clientH,
                }}>
                <AnalogStick
                  style={{
                    width: clientW * 0.5,
                    height: clientH,
                  }}
                  radius={150}
                  handleRadius={100}
                  onStickChange={(data: any) => handleStickMove('right', data)}
                />
              </View>
            );
          } else {
            return (
              <View
                key={button.name}
                style={[
                  styles.button,
                  {top: button.y, left: button.x},
                  {opacity},
                ]}>
                <View style={styles.rightJs}>
                  <AnalogStick
                    style={styles.analogStick}
                    radius={140}
                    handleRadius={80}
                    onStickChange={(data: any) =>
                      handleStickMove('right', data)
                    }
                  />
                </View>
              </View>
            );
          }
        } else {
          return (
            <GamepadButton
              key={button.name}
              name={button.name}
              scale={button.scale}
              style={[
                styles.button,
                {opacity},
                {top: button.y, left: button.x},
              ]}
              looping={loopingMacroNames?.has(button.name) ?? false}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            />
          );
        }
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // backgroundColor: 'rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 9,
  },
  button: {
    opacity: 0.5,
    position: 'absolute',
    zIndex: 10,
  },
  leftJs: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  rightJs: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  analogStick: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, .5)',
    overflow: 'hidden',
  },
});

export default CustomVirtualGamepad;
