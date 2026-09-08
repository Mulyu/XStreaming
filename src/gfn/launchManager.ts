import {DeviceEventEmitter} from 'react-native';
import {GfnStreamAdapter} from './streamAdapter';

// Owns at most one active GFN launch (CloudMatch queue + WebRTC session),
// independent of whether any screen is currently showing it. This is what
// lets the user leave the connecting/queueing screen (e.g. to play xCloud
// while GFN queues) without canceling the launch: NativeStream only
// attaches/detaches a listener on mount/unmount, it doesn't start or stop
// the underlying session. Re-opening the title later re-attaches to the same
// adapter and picks up wherever the session currently is.

type GfnManagerListener = {
  onState?: (state: string, detail?: string) => void;
  onTrack?: (event: any) => void;
  onProgress?: (text: string) => void;
};

class GfnLaunchManager {
  private adapter: GfnStreamAdapter | null = null;
  private appId: string | null = null;
  private lastState = 'idle';
  private lastDetail: string | undefined;
  private lastProgress = '';
  private lastTrackEvents: any[] = [];
  private listener: GfnManagerListener | null = null;

  constructor() {
    // The queue-phase keep-alive notification's "Disconnect" action is
    // normally handled by NativeStream while it's attached (mirroring
    // xCloud's own keep-alive disconnect handling). While nobody is attached
    // (the user left to do something else while GFN queues), handle it here
    // instead so the button still works.
    DeviceEventEmitter.addListener('StreamKeepAliveDisconnect', () => {
      if (!this.listener) {
        this.cancel();
      }
    });
  }

  isActiveFor(appId: string): boolean {
    return this.adapter !== null && this.appId === appId;
  }

  // Start a new launch, or return the already-running one for the same
  // title untouched. Starting a different title cancels whatever was
  // running before -- a GFN account only has one active session at a time
  // anyway.
  start(appId: string, title: string): GfnStreamAdapter {
    if (this.adapter && this.appId === appId) {
      return this.adapter;
    }
    if (this.adapter) {
      this.adapter.close();
    }
    this.appId = appId;
    this.lastState = 'idle';
    this.lastDetail = undefined;
    this.lastProgress = '';
    this.lastTrackEvents = [];
    const adapter = new GfnStreamAdapter({
      appId,
      title,
      onProgress: text => {
        this.lastProgress = text;
        this.listener?.onProgress?.(text);
      },
    });
    adapter.setTrackHandler(event => {
      this.lastTrackEvents.push(event);
      this.listener?.onTrack?.(event);
    });
    adapter.setConnectedHandler((state, detail) => {
      this.lastState = state;
      this.lastDetail = detail;
      this.listener?.onState?.(state, detail);
      if (
        (state === 'closed' || state === 'failed') &&
        this.adapter === adapter
      ) {
        this.adapter = null;
        this.appId = null;
      }
    });
    this.adapter = adapter;
    adapter.init();
    return adapter;
  }

  // NativeStream calls this once its own handlers are wired up; replays
  // whatever already happened before it attached (queue progress, or an
  // already-connected stream's tracks) so the screen shows the live state
  // immediately instead of a blank loading screen.
  attach(appId: string, listener: GfnManagerListener): void {
    if (this.appId !== appId) {
      return;
    }
    this.listener = listener;
    if (this.lastState !== 'idle') {
      listener.onState?.(this.lastState, this.lastDetail);
    }
    if (this.lastProgress) {
      listener.onProgress?.(this.lastProgress);
    }
    this.lastTrackEvents.forEach(event => listener.onTrack?.(event));
  }

  // NativeStream calls this on unmount when leaving without disconnecting
  // (still queueing/connecting) -- the launch keeps running.
  detach(): void {
    this.listener = null;
  }

  getAdapter(): GfnStreamAdapter | null {
    return this.adapter;
  }

  // Fully stop the current launch (explicit disconnect).
  cancel(): void {
    this.adapter?.close();
    this.adapter = null;
    this.appId = null;
    this.listener = null;
  }
}

export const gfnLaunchManager = new GfnLaunchManager();

// A webRTCClient-compatible handle NativeStream can hold for a GFN stream,
// backed by the singleton manager above instead of owning a GfnStreamAdapter
// directly. init()/setTrackHandler()/setConnectedHandler() start/attach to
// the manager's launch; everything else proxies straight to the live
// adapter. close({keepAlive: true}) detaches without canceling (used when
// leaving while still queueing/connecting); a plain close() is a real
// disconnect.
export class GfnAttachedStream {
  private trackHandler: ((event: any) => void) | null = null;
  private connectedHandler: ((state: string, detail?: string) => void) | null =
    null;

  constructor(
    private readonly options: {
      appId: string;
      title: string;
      onProgress?: (text: string) => void;
    },
  ) {}

  init(): void {
    gfnLaunchManager.start(this.options.appId, this.options.title);
  }

  setTrackHandler(listener: any): void {
    this.trackHandler = listener;
  }

  // NativeStream always calls setTrackHandler before setConnectedHandler, so
  // both are wired up by the time we attach here.
  setConnectedHandler(listener: any): void {
    this.connectedHandler = listener;
    gfnLaunchManager.attach(this.options.appId, {
      onState: (state, detail) => this.connectedHandler?.(state, detail),
      onTrack: event => this.trackHandler?.(event),
      onProgress: text => this.options.onProgress?.(text),
    });
  }

  setGamepadState(gpState: any): void {
    gfnLaunchManager.getAdapter()?.setGamepadState(gpState);
  }

  setPollRate(value: number): void {
    gfnLaunchManager.getAdapter()?.setPollRate(value);
  }

  getChannelProcessor(name: string): any {
    return (
      gfnLaunchManager.getAdapter()?.getChannelProcessor(name) ?? {
        queueGamepadState: () => {},
        queueGamepadStates: () => {},
        flushGamepadInput: () => {},
        addProcessedFrame: () => {},
        queuePointerInput: () => {},
        isPaused: false,
        startMic: () => Promise.resolve(false),
        stopMic: () => {},
        send: () => {},
      }
    );
  }

  getAudioVolume(): Promise<number> {
    return (
      gfnLaunchManager.getAdapter()?.getAudioVolume() ?? Promise.resolve(0)
    );
  }

  getStreamState(): Promise<any> {
    return (
      gfnLaunchManager.getAdapter()?.getStreamState() ?? Promise.resolve({})
    );
  }

  setSdpHandler(): void {}
  setSystemUiHandler(): void {}
  setMessageHandler(): void {}
  setMaxTouchPoints(): void {}
  setSupportedSystemUis(): void {}
  setCoop(): void {}
  setRumbleHandler(): void {}

  close(opts?: {keepAlive?: boolean}): void {
    if (opts?.keepAlive) {
      gfnLaunchManager.detach();
      return;
    }
    gfnLaunchManager.cancel();
  }
}
