import React from 'react';
import {
  GfnDeviceChallenge,
  requestDeviceAuthorization,
  pollForTokens,
  isSignedIn,
  clearStoredTokens,
} from './auth';

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
