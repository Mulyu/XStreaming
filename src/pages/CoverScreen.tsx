import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {coverGamepadBus} from '../utils/coverGamepadBus';
import {getCoverLayout, CoverButton} from '../store/coverLayoutStore';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode session. Runs on the app's single JS context, so touching a
// button drives the same live stream input as the on-screen gamepad
// (through coverGamepadBus).
//
// Touch handling: the container claims the whole surface as a single responder
// and hit-tests every active touch against the buttons itself. React Native's
// Pressable/responder grants to one view at a time, so two buttons — or a
// button while the palm rests on the screen edge — couldn't be pressed at once.
// Tracking the raw touch list lets several buttons register simultaneously and
// ignores edge touches that don't land on a button.

export default function CoverScreen() {
  const [active, setActive] = React.useState(coverGamepadBus.isActive());
  const [layout, setLayout] = React.useState<CoverButton[]>(
    () => coverGamepadBus.getLayout() ?? getCoverLayout(''),
  );
  const [surface, setSurface] = React.useState({width: 0, height: 0});
  const [pressed, setPressed] = React.useState<string[]>([]);
  const pressedRef = React.useRef<Set<string>>(new Set());
  const layoutRef = React.useRef(layout);
  const surfaceRef = React.useRef(surface);
  layoutRef.current = layout;
  surfaceRef.current = surface;

  React.useEffect(() => coverGamepadBus.subscribe(setActive), []);
  React.useEffect(
    () => coverGamepadBus.subscribeLayout(l => setLayout(l as CoverButton[])),
    [],
  );
  // Re-read the saved layout whenever a game becomes active (in case it was
  // edited since this surface was last shown).
  React.useEffect(() => {
    if (active) {
      setLayout(coverGamepadBus.getLayout() ?? getCoverLayout(''));
    }
  }, [active]);

  const hitTest = (px: number, py: number): string | null => {
    const {width, height} = surfaceRef.current;
    for (const b of layoutRef.current) {
      if (!b.show) {
        continue;
      }
      const left = b.x * width;
      const top = b.y * height;
      const side = b.size * width;
      if (px >= left && px <= left + side && py >= top && py <= top + side) {
        return b.name;
      }
    }
    return null;
  };

  const updateFromTouches = (touches: any[]) => {
    const now = new Set<string>();
    for (const tch of touches) {
      const name = hitTest(tch.locationX, tch.locationY);
      if (name) {
        now.add(name);
      }
    }
    const prev = pressedRef.current;
    now.forEach(n => {
      if (!prev.has(n)) {
        coverGamepadBus.pressIn(n);
      }
    });
    prev.forEach(n => {
      if (!now.has(n)) {
        coverGamepadBus.pressOut(n);
      }
    });
    pressedRef.current = now;
    setPressed([...now]);
  };

  const onTouch = (e: any) => updateFromTouches(e.nativeEvent.touches || []);
  const onRelease = () => updateFromTouches([]);

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
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onTouch}
      onResponderStart={onTouch}
      onResponderMove={onTouch}
      onResponderEnd={onTouch}
      onResponderRelease={onRelease}
      onResponderTerminate={onRelease}>
      {layout.map(b => {
        if (!b.show || surface.width === 0) {
          return null;
        }
        const side = b.size * surface.width;
        const down = pressed.includes(b.name);
        return (
          <View
            key={b.name}
            pointerEvents="none"
            style={[
              styles.button,
              {
                left: b.x * surface.width,
                top: b.y * surface.height,
                width: side,
                height: side,
              },
              down && styles.buttonDown,
            ]}>
            <Text style={[styles.buttonLabel, down && styles.buttonLabelDown]}>
              {b.label}
            </Text>
          </View>
        );
      })}
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
