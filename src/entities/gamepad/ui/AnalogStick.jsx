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
  // either way), same as clicking it in (L3/R3). `pressed` is true as soon as
  // the double-tap is confirmed and stays true for as long as that same
  // finger stays down (even while dragging the stick), false once it lifts --
  // see AnalogStickView.java's own comment on stickPressed.
  const handleAnalogStickPress = useCallback(
    event => {
      if (onStickPress) {
        onStickPress(!!event?.nativeEvent?.pressed);
      }
    },
    [onStickPress],
  );

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
