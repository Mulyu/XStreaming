import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import {coverGamepadBus} from '../utils/coverGamepadBus';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode session. It runs on the app's single JS context, so pressing a
// button here drives the same live stream input as the on-screen gamepad
// (through coverGamepadBus).

type PadButton = {name: string; label: string};

// L / R shoulder + trigger buttons, laid out as a left column and a right
// column to match how the device is held.
const LEFT: PadButton[] = [
  {name: 'LeftTrigger', label: 'LT'},
  {name: 'LeftShoulder', label: 'LB'},
];
const RIGHT: PadButton[] = [
  {name: 'RightTrigger', label: 'RT'},
  {name: 'RightShoulder', label: 'RB'},
];

function CoverButton({name, label}: PadButton) {
  const [down, setDown] = React.useState(false);
  return (
    <Pressable
      onPressIn={() => {
        setDown(true);
        coverGamepadBus.pressIn(name);
      }}
      onPressOut={() => {
        setDown(false);
        coverGamepadBus.pressOut(name);
      }}
      style={[styles.button, down && styles.buttonDown]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export default function CoverScreen() {
  const [active, setActive] = React.useState(coverGamepadBus.isActive());
  React.useEffect(() => coverGamepadBus.subscribe(setActive), []);

  if (!active) {
    return (
      <View style={styles.idleWrap}>
        <Text style={styles.brand}>XStreaming</Text>
        <Text style={styles.idleText}>Start a game to use cover controls</Text>
      </View>
    );
  }

  return (
    <View style={styles.padWrap}>
      <View style={styles.column}>
        {LEFT.map(b => (
          <CoverButton key={b.name} {...b} />
        ))}
      </View>
      <View style={styles.column}>
        {RIGHT.map(b => (
          <CoverButton key={b.name} {...b} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  idleWrap: {
    flex: 1,
    backgroundColor: '#0E1512',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  brand: {color: '#2FD24B', fontSize: 22, fontWeight: '700', letterSpacing: 1},
  idleText: {color: '#8A9A92', fontSize: 13, marginTop: 8, textAlign: 'center'},
  padWrap: {
    flex: 1,
    backgroundColor: '#0E1512',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  column: {
    justifyContent: 'space-between',
    height: '100%',
    paddingVertical: 6,
  },
  button: {
    width: 92,
    height: 60,
    borderRadius: 14,
    marginVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDown: {
    backgroundColor: 'rgba(47,210,75,0.28)',
    borderColor: '#2FD24B',
  },
  buttonLabel: {
    color: '#E6ECE8',
    fontSize: 20,
    fontWeight: '700',
  },
});
