import React from 'react';
import {
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {setPhysicalDebugEnabled} from '../api/native';
import {alpha, palette} from '../../../shared/config/palette';

// TV only: the physical keyboard/mouse bridge's state, drawn at the top left
// of the stream so it can be read off the screen (a TV has no easy way to get
// the debug log into a chat). A diagnostic aid for mouse capture problems --
// remove it once those are sorted out.
export const PhysicalInputDebug: React.FC = () => {
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    if (!Platform.isTV) {
      return undefined;
    }
    setPhysicalDebugEnabled(true);
    const sub = DeviceEventEmitter.addListener(
      'onPhysicalDebug',
      (e: {text: string}) => setText(e.text),
    );
    return () => {
      sub.remove();
      setPhysicalDebugEnabled(false);
    };
  }, []);

  if (!Platform.isTV || !text) {
    return null;
  }
  return (
    <View style={styles.box} pointerEvents="none">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: alpha(palette.scrim, 0.75),
  },
  text: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 14,
    color: palette.text,
  },
});
