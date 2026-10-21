export type HomeEntry =
  // Back from the Login screen with the XAL redirect URL: finish signing in.
  | 'finishXalLogin'
  // Normal launch, not signed in: open the app right away and refresh the
  // token in the background.
  | 'enterMainSilently'
  // Started from Settings' sign-in row: run the interactive login flow.
  | 'checkInteractively'
  // Already signed in: nothing to wait for, just open the app.
  | 'enterMain';

// What the Home screen should do when it mounts.
//
// "Already signed in" is reachable on a normal launch: the Redux store
// outlives the Activity, so after the app is closed with Back and reopened
// while its process is still alive, Home mounts again with `isLogined`
// already true. That case used to match none of the branches -- Home never
// navigated on, and the user was left on a blank (black) screen.
export const decideHomeEntry = (params: {
  hasXalUrl: boolean;
  isLogined: boolean;
  wantsLogin: boolean;
}): HomeEntry => {
  const {hasXalUrl, isLogined, wantsLogin} = params;
  if (isLogined) {
    return 'enterMain';
  }
  if (hasXalUrl) {
    return 'finishXalLogin';
  }
  return wantsLogin ? 'checkInteractively' : 'enterMainSilently';
};
