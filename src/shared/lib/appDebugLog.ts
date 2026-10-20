import {NativeModules} from 'react-native';

const AppDebugLogNative = NativeModules.AppDebugLog;

// JS-side half of AppDebugLogModule.java/AppDebugLog.java -- a general,
// provider-agnostic sibling to features/ps-plus-session/api/native.ts's own
// getDebugLog(), which only ever captures an active PS Plus session's native
// chiaki log. This accumulates whatever JS calls log() here -- currently only
// App.tsx's AppState listener -- so foreground/background transitions (which
// drive things like PS Plus's background audio mute) have a trace to go on.
export const appDebugLog = (tag: string, message: string): void => {
  AppDebugLogNative?.log?.(tag, message);
};

// See AppDebugLogModule.java's getDebugLog() for the exact cap/behavior this
// reads (same shape as PS Plus's own). Resolves '' if nothing has logged yet.
export const getAppDebugLog = (): Promise<string> => {
  return AppDebugLogNative?.getDebugLog?.() ?? Promise.resolve('');
};
