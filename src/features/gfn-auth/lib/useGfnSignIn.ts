import React from 'react';
import {AppState} from 'react-native';
import {
  GfnDeviceChallenge,
  requestDeviceAuthorization,
  pollForTokens,
  isSignedIn,
  clearStoredTokens,
} from '../../../entities/gfn-account';

// Shared GFN device-code sign-in flow, extracted so the Library title detail
// screen and the Settings account row don't each keep their own copy of the
// same polling/cancellation state machine.
export function useGfnSignIn() {
  const [signedIn, setSignedIn] = React.useState(() => isSignedIn());
  const [loginVisible, setLoginVisible] = React.useState(false);
  const [challenge, setChallenge] = React.useState<GfnDeviceChallenge | null>(
    null,
  );
  const [loginStatus, setLoginStatus] = React.useState<
    'starting' | 'waiting' | 'failed'
  >('starting');
  const cancelledRef = React.useRef(false);
  const pendingLaunchRef = React.useRef<(() => void) | null>(null);

  // The native (Compose/Kotlin) Settings screen can now sign in/out of GFN
  // too (see android/.../com/xstreaming/settings/GfnDeviceAuthClient.kt),
  // writing to the exact same MMKV key isSignedIn() reads -- but it's a
  // plain Activity launch, not a React Navigation transition, so returning
  // from it never re-runs this hook's initial `isSignedIn()` call. Without
  // this, the JS GFN row could keep showing "not signed in" (and start a
  // second, redundant device-code flow on tap) even after the native
  // screen just signed the user in.
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setSignedIn(isSignedIn());
      }
    });
    return () => subscription.remove();
  }, []);

  const startLogin = React.useCallback((onSignedIn?: () => void) => {
    pendingLaunchRef.current = onSignedIn ?? null;
    cancelledRef.current = false;
    setChallenge(null);
    setLoginStatus('starting');
    setLoginVisible(true);
    requestDeviceAuthorization()
      .then(ch => {
        if (cancelledRef.current) {
          return;
        }
        setChallenge(ch);
        setLoginStatus('waiting');
        return pollForTokens(ch, {shouldCancel: () => cancelledRef.current});
      })
      .then(() => {
        if (cancelledRef.current) {
          return;
        }
        setLoginVisible(false);
        setSignedIn(true);
        pendingLaunchRef.current?.();
      })
      .catch((e: any) => {
        if (cancelledRef.current || e?.message === 'cancelled') {
          return;
        }
        setLoginStatus('failed');
      });
  }, []);

  const cancelLogin = React.useCallback(() => {
    cancelledRef.current = true;
    setLoginVisible(false);
  }, []);

  // Retries the same in-flight attempt (and its pending launch callback,
  // if any) after a failure, rather than starting a fresh one with no target.
  const retryLogin = React.useCallback(() => {
    startLogin(pendingLaunchRef.current ?? undefined);
  }, [startLogin]);

  const signOut = React.useCallback(() => {
    clearStoredTokens();
    setSignedIn(false);
  }, []);

  return {
    signedIn,
    loginVisible,
    challenge,
    loginStatus,
    startLogin,
    retryLogin,
    cancelLogin,
    signOut,
  };
}
