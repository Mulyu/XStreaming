import store from '../../../shared/lib/reduxStore';
import {getSettings} from '../../../shared/lib/settings';
import {debugFactory} from '../../../shared/lib/debug';
import Authentication from '../../../Authentication';
import MsalAuthentication from '../../../MsalAuthentication';
import {
  isSignedIn as isGfnSignedIn,
  getValidTokens as getValidGfnTokens,
} from '../../../entities/gfn-account';

const log = debugFactory('xboxAuthSession');

const MSAL = 'msal';

// The xCloud (Xbox) authentication object lives in the Redux store -- Settings,
// the stream screens and the xCloud session client all read it from there --
// and is created once at app start (see useXboxAuthBootstrap), not by any
// screen. Completion updates Redux, which the screens pick up reactively.

export type AuthFailureHandler = (message: string, rollback: boolean) => void;

// Only set while an interactive sign-in (started from Settings) is in
// flight. A failed silent refresh at launch stays non-blocking: xCloud
// sign-in is optional, so it is logged, not shown.
let interactiveFailureHandler: AuthFailureHandler | null = null;

export const setInteractiveFailureHandler = (
  handler: AuthFailureHandler | null,
): void => {
  interactiveFailureHandler = handler;
};

const authenticationCompleted = (streamingTokens: any, webToken: any) => {
  log.info('Authentication completed');
  store.dispatch({type: 'SET_STREAMING_TOKEN', payload: streamingTokens});
  store.dispatch({type: 'SET_WEB_TOKEN', payload: webToken});
  store.dispatch({type: 'SET_LOGIN', payload: true});
};

const authenticationFailed = (message: string, rollback = false) => {
  if (interactiveFailureHandler) {
    interactiveFailureHandler(message, rollback);
    return;
  }
  log.info('Silent xCloud auth check failed (non-blocking):', message);
};

// Returns the app's authentication object, creating (and registering it in
// Redux) on first use. Idempotent and synchronous, so anything that needs the
// object can simply call it.
export const ensureAuthentication = (): any => {
  const existing = store.getState().authentication;
  if (existing) {
    return existing;
  }
  log.info('Authentication initial.');
  let authentication: any = new Authentication(
    authenticationCompleted,
    authenticationFailed,
  );
  authentication._tokenStore.load();
  if (
    getSettings().use_msal_login ||
    authentication._tokenStore.getAuthenticationMethod() === MSAL
  ) {
    log.info('Using MSAL authentication method.');
    authentication = new MsalAuthentication(
      authenticationCompleted,
      authenticationFailed,
    );
  }
  store.dispatch({type: 'SET_AUTHENTICATION', payload: authentication});
  return authentication;
};

// Replaces the XAL authentication with MSAL (device code), e.g. after the XAL
// flow failed.
export const switchToMsalAuthentication = (): any => {
  const authentication = new MsalAuthentication(
    authenticationCompleted,
    authenticationFailed,
  );
  store.dispatch({type: 'SET_AUTHENTICATION', payload: authentication});
  return authentication;
};

// The silent, best-effort "keep the tokens fresh" check run once at launch
// (and again when the network comes back): never blocks the UI and never
// prompts. GFN is refreshed the same way if signed in; xCloud only if not
// already signed in this process.
export const runSilentAuthCheck = (): void => {
  if (isGfnSignedIn()) {
    getValidGfnTokens().catch(() => {});
  }
  if (store.getState().isLogined) {
    return;
  }
  ensureAuthentication()
    .checkAuthentication()
    .catch(() => {});
};
