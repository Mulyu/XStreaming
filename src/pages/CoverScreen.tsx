import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import {coverGamepadBus} from '../utils/coverGamepadBus';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode session. It runs on the app's single JS context, so touching a
// zone here drives the same live stream input as the on-screen gamepad
// (through coverGamepadBus).

type Zone = {name: string; label: string};

// The cover screen is split into four large touch zones (2 columns x 2 rows).
// Left/right are mirrored vs. a normal grip because the outer screen faces the
// other way, so the LEFT half sends the R buttons and the RIGHT half the L
// buttons. Top row = triggers, bottom row = shoulders.
const HALVES: Zone[][] = [
  [
    {name: 'RightTrigger', label: 'RT'},
    {name: 'RightShoulder', label: 'RB'},
  ],
  [
    {name: 'LeftTrigger', label: 'LT'},
    {name: 'LeftShoulder', label: 'LB'},
  ],
];

function CoverZone({name, label}: Zone) {
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
      style={[styles.zone, down && styles.zoneDown]}>
      <Text style={[styles.zoneLabel, down && styles.zoneLabelDown]}>
        {label}
      </Text>
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
    <View style={styles.grid}>
      {HALVES.map((half, i) => (
        <View key={i} style={styles.half}>
          {half.map(zone => (
            <CoverZone key={zone.name} {...zone} />
          ))}
        </View>
      ))}
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
  grid: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0E1512',
  },
  half: {
    flex: 1,
    flexDirection: 'column',
  },
  zone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  zoneDown: {
    backgroundColor: 'rgba(47,210,75,0.26)',
    borderColor: '#2FD24B',
  },
  zoneLabel: {
    color: '#8A9A92',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
  },
  zoneLabelDown: {
    color: '#E6ECE8',
  },
});
