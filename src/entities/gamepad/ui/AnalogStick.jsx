import React, {useCallback} from 'react';
import {requireNativeComponent} from 'react-native';

const RNAnalogStick = requireNativeComponent('AnalogStickView');

const AnalogStick = ({
  radius = 150,
  handleRadius = 100,
  onStickChange,
  onStickPress,
  ...props
}) => {
  const handleAnalogStickChange = useCallback(
    event => {
      if (onStickChange) {
        onStickChange(event.nativeEvent);
      }
    },
    [onStickChange],
  );

  // Fired on a double-tap of the stick (free or fixed -- same native view
  // either way), same as clicking it in (L3/R3).
  const handleAnalogStickPress = useCallback(() => {
    if (onStickPress) {
      onStickPress();
    }
  }, [onStickPress]);

  return (
    <RNAnalogStick
      {...props}
      radius={radius}
      handleRadius={handleRadius}
      onAnalogStickChange={handleAnalogStickChange}
      onAnalogStickPress={handleAnalogStickPress}
    />
  );
};

export default AnalogStick;
