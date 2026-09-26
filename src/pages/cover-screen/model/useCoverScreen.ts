import React from 'react';
import {DeviceEventEmitter} from 'react-native';
import {
  coverGamepadBus,
  getCoverLayout,
  CoverButton,
} from '../../../features/controller-customization';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode session. Runs on the app's single JS context, so touching a
// button drives the same live stream input as the on-screen gamepad
// (through coverGamepadBus).
//
// Touch handling: touches are captured natively (CoverDisplayModule wraps this
// root in a layout that swallows touch events) and delivered here as a
// "CoverTouch" event carrying the raw active-pointer coordinates. This bypasses
// React Native's gesture responder, which is global to the ReactInstanceManager
// — since the cover is a second ReactRootView on that same instance, letting RN
// process the touches would let the inner display steal (and terminate) the
// cover's responder, dropping any held cover button while the inner display is
// touched. Hit-testing the raw touch list also lets several buttons register at
// once and ignores edge touches that don't land on a button.
export function useCoverScreen() {
  const [active, setActive] = React.useState(coverGamepadBus.isActive());
  const [layout, setLayout] = React.useState<CoverButton[]>(
    () => coverGamepadBus.getLayout() ?? getCoverLayout(''),
  );
  const [surface, setSurface] = React.useState({width: 0, height: 0});
  const [pressed, setPressed] = React.useState<string[]>([]);
  const pressedRef = React.useRef<Set<string>>(new Set());
  const layoutRef = React.useRef(layout);
  const surfaceRef = React.useRef(surface);
  const updateRef = React.useRef<(touches: any[]) => void>(() => {});
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
  updateRef.current = updateFromTouches;

  // Native cover-touch events (see CoverDisplayModule) carry the raw active
  // pointers as {x, y}; map them to the hit-test's expected shape.
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('CoverTouch', (payload: any) => {
      const touches = (payload?.touches || []).map((t: any) => ({
        locationX: t.x,
        locationY: t.y,
      }));
      updateRef.current(touches);
    });
    return () => sub.remove();
  }, []);

  const onSurfaceLayout = (width: number, height: number) => {
    setSurface({width, height});
  };

  return {
    active,
    layout,
    surface,
    pressed,
    onSurfaceLayout,
  };
}

export type CoverScreenViewModel = ReturnType<typeof useCoverScreen>;
