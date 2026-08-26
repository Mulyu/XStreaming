// Bridges the foldable cover-display surface to the stream screen's gamepad
// input. Both run in the same JS runtime (the cover screen is a second
// ReactRootView on the same ReactInstanceManager), but in separate React trees,
// so this module-level singleton is how the cover controls reach the active
// stream's press handlers.

type PressHandler = (name: string) => void;
type Handlers = {onPressIn: PressHandler; onPressOut: PressHandler};

let handlers: Handlers | null = null;
let active = false;
let liveLayout: any[] | null = null;
const listeners = new Set<(active: boolean) => void>();
const layoutListeners = new Set<(layout: any[]) => void>();

export const coverGamepadBus = {
  // The stream screen registers its press/release handlers while connected.
  setHandlers(h: Handlers) {
    handlers = h;
  },
  clearHandlers() {
    handlers = null;
  },
  pressIn(name: string) {
    handlers?.onPressIn(name);
  },
  pressOut(name: string) {
    handlers?.onPressOut(name);
  },
  // Whether a stream is currently active (so the cover UI shows controls).
  setActive(value: boolean) {
    active = value;
    listeners.forEach(l => l(value));
  },
  isActive() {
    return active;
  },
  subscribe(l: (active: boolean) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  // Live cover-button layout, pushed by the editor so the cover updates as you
  // drag/resize on the inner screen.
  setLayout(layout: any[]) {
    liveLayout = layout;
    layoutListeners.forEach(l => l(layout));
  },
  getLayout() {
    return liveLayout;
  },
  subscribeLayout(l: (layout: any[]) => void) {
    layoutListeners.add(l);
    return () => {
      layoutListeners.delete(l);
    };
  },
};
