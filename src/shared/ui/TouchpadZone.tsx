import React from 'react';
import {
  Pressable,
  requireNativeComponent,
  StyleSheet,
  Text,
  View,
  ViewProps,
} from 'react-native';
import {Icon} from 'react-native-paper';
import {useTVFocus, tvFocusRing} from './tvFocus';
import {alpha, palette} from '../config/palette';

export type TouchpadFinger = {id: number; x: number; y: number};

type NativeTouchpadChangeEvent = {
  nativeEvent: {touches: TouchpadFinger[]};
};

type NativeTouchpadViewProps = ViewProps & {
  onTouchpadChange?: (event: NativeTouchpadChangeEvent) => void;
};

// A plain native View hosting its own onTouchEvent (see TouchpadView.java),
// for the same reason as SwipeAimZone's view: it coexists with the virtual
// gamepad's other native touch views, where a JS gesture handler doesn't.
const NativeTouchpadView =
  requireNativeComponent<NativeTouchpadViewProps>('TouchpadView');

export interface TouchpadZoneProps {
  // Pad rectangle, in the play surface's pixels.
  rect: {x: number; y: number; width: number; height: number};
  // Up to two fingers, positions 0..1 across the pad, ids stable per touch.
  onChange: (touches: TouchpadFinger[]) => void;
  onClose: () => void;
  hint: string;
  zIndex?: number;
}

// The PS touchpad as an on-screen pad: a translucent rectangle that reports
// swipes and taps (and, via the caller, press-and-hold as a click).
const TouchpadZone: React.FC<TouchpadZoneProps> = ({
  rect,
  onChange,
  onClose,
  hint,
  zIndex = 10,
}) => {
  const [fingers, setFingers] = React.useState<TouchpadFinger[]>([]);
  const closeFocus = useTVFocus();

  const handleChange = (event: NativeTouchpadChangeEvent) => {
    const touches = event.nativeEvent.touches ?? [];
    setFingers(touches);
    onChange(touches);
  };

  return (
    <View
      style={[
        styles.pad,
        {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          zIndex,
        },
      ]}>
      <NativeTouchpadView
        style={StyleSheet.absoluteFill}
        onTouchpadChange={handleChange}
      />
      <View style={styles.hintWrap} pointerEvents="none">
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {fingers.map(f => (
        <View
          key={f.id}
          pointerEvents="none"
          style={[
            styles.finger,
            {
              left: f.x * rect.width - FINGER_SIZE / 2,
              top: f.y * rect.height - FINGER_SIZE / 2,
            },
          ]}
        />
      ))}
      <Pressable
        style={[styles.close, closeFocus.focused && tvFocusRing]}
        hitSlop={8}
        onPress={onClose}
        onFocus={closeFocus.onFocus}
        onBlur={closeFocus.onBlur}>
        <Icon source="close" size={16} color={palette.text} />
      </Pressable>
    </View>
  );
};

const FINGER_SIZE = 44;

const styles = StyleSheet.create({
  pad: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(palette.white, 0.35),
    backgroundColor: alpha(palette.white, 0.1),
    overflow: 'hidden',
  },
  hintWrap: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: {
    color: alpha(palette.white, 0.45),
    fontSize: 11,
    fontWeight: '600',
  },
  finger: {
    position: 'absolute',
    width: FINGER_SIZE,
    height: FINGER_SIZE,
    borderRadius: FINGER_SIZE / 2,
    backgroundColor: alpha(palette.provider.ps, 0.55),
    borderWidth: 2,
    borderColor: palette.provider.psBright,
  },
  close: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.black, 0.5),
  },
});

export default TouchpadZone;
