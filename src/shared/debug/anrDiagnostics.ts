import {NativeModules} from 'react-native';

// TEMPORARY diagnostic aid for tracking down the PS Plus streaming freeze --
// see android's AnrWatchdog.java for the capture side. Remove this whole
// file (and AnrDiagnosticsOverlay.tsx, and the native pieces it comments
// point to) once the freeze's real cause is found, fixed, and confirmed
// on-device.
const {AnrDiagnostics} = NativeModules;

export const getLastAnrTrace = (): Promise<string | null> =>
  AnrDiagnostics?.getLastAnrTrace
    ? AnrDiagnostics.getLastAnrTrace()
    : Promise.resolve(null);

export const clearAnrTrace = (): Promise<void> =>
  AnrDiagnostics?.clearAnrTrace
    ? AnrDiagnostics.clearAnrTrace()
    : Promise.resolve();
