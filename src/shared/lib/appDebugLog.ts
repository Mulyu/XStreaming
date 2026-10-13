import {NativeModules} from 'react-native';

const AppDebugLogNative = NativeModules.AppDebugLog;

// JS-side half of AppDebugLogModule.java/AppDebugLog.java -- a general,
// provider-agnostic sibling to features/ps-plus-session/api/native.ts's own
// getDebugLog(), which only ever captures an active PS Plus session's native
// chiaki log. This instead accumulates app/Activity-level lifecycle events
// (MainActivity's own onCreate/onResume/onPause/onDestroy, plus whatever JS
// calls log() here, e.g. this app's AppState listener in App.tsx) into one
// shared file, so a report about something that isn't PS-Plus-specific --
// e.g. the Home/Library screen occasionally coming back black after the app
// is backgrounded and resumed -- has an actual trace to go on.
export const appDebugLog = (tag: string, message: string): void => {
  AppDebugLogNative?.log?.(tag, message);
};

// See AppDebugLogModule.java's getDebugLog() for the exact cap/behavior this
// reads (same shape as PS Plus's own). Resolves '' if nothing has logged yet.
export const getAppDebugLog = (): Promise<string> => {
  return AppDebugLogNative?.getDebugLog?.() ?? Promise.resolve('');
};
