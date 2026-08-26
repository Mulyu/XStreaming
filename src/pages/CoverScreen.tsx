import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import {coverGamepadBus} from '../utils/coverGamepadBus';
import {getCoverLayout, CoverButton} from '../store/coverLayoutStore';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode session. Runs on the app's single JS context, so pressing a
// button drives the same live stream input as the on-screen gamepad
// (through coverGamepadBus). Its button sizes/positions are edited from the
// inner screen (CoverLayoutEditor) and pushed here live via the bus.

function CoverButtonView({
  button,
  surface,
}: {
  button: CoverButton;
  surface: {width: number; height: number};
}) {
  const [down, setDown] = React.useState(false);
  if (!button.show || surface.width === 0) {
    return null;
  }
  const side = button.size * surface.width;
  return (
    <Pressable
      onPressIn={() => {
        setDown(true);
        coverGamepadBus.pressIn(button.name);
      }}
      onPressOut={() => {
        setDown(false);
        coverGamepadBus.pressOut(button.name);
      }}
      style={[
        styles.button,
        {
          left: button.x * surface.width,
          top: button.y * surface.height,
          width: side,
          height: side,
        },
        down && styles.buttonDown,
      ]}>
      <Text style={[styles.buttonLabel, down && styles.buttonLabelDown]}>
        {button.label}
      </Text>
    </Pressable>
  );
}

export default function CoverScreen() {
  const [active, setActive] = React.useState(coverGamepadBus.isActive());
  const [layout, setLayout] = React.useState<CoverButton[]>(
    () => coverGamepadBus.getLayout() ?? getCoverLayout(),
  );
  const [surface, setSurface] = React.useState({width: 0, height: 0});

  React.useEffect(() => coverGamepadBus.subscribe(setActive), []);
  React.useEffect(
    () => coverGamepadBus.subscribeLayout(l => setLayout(l as CoverButton[])),
    [],
  );
  // Re-read the saved layout whenever a game becomes active (in case it was
  // edited since this surface was last shown).
  React.useEffect(() => {
    if (active) {
      setLayout(coverGamepadBus.getLayout() ?? getCoverLayout());
    }
  }, [active]);

  if (!active) {
    return (
      <View style={styles.idleWrap}>
        <Text style={styles.brand}>XStreaming</Text>
        <Text style={styles.idleText}>Start a game to use cover controls</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.wrap}
      onLayout={e => {
        const {width, height} = e.nativeEvent.layout;
        setSurface({width, height});
      }}>
      {layout.map(b => (
        <CoverButtonView key={b.name} button={b} surface={surface} />
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
  wrap: {flex: 1, backgroundColor: '#0E1512'},
  button: {
    position: 'absolute',
    borderRadius: 16,
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
  buttonLabel: {color: '#E6ECE8', fontSize: 22, fontWeight: '800'},
  buttonLabelDown: {color: '#FFFFFF'},
});
