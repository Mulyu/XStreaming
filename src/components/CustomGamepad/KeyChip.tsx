import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

type Props = {
  label: string;
  width?: number;
  height?: number;
  scale?: number;
  style?: any;
};

// The editor/in-game visual for a GFN keyboard-key button -- a generic
// labeled chip, unlike GamepadButton's per-name SVG icons, since a key
// button's face is just whatever text label it was given.
const KeyChip: React.FC<Props> = ({
  label,
  width = 50,
  height = 50,
  scale = 1,
  style,
}) => {
  return (
    <View
      style={[
        styles.chip,
        {width: width * scale, height: height * scale},
        style,
      ]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#eef4ef',
  },
});

export default KeyChip;
