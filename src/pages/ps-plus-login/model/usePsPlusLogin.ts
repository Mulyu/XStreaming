import React from 'react';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../../../shared/lib/debug';
import {setNpsso} from '../../../features/ps-plus-session';

const log = debugFactory('PsPlusLoginScreen');

// PSN has no OAuth device-code flow like GFN's, so cloud streaming auth
// works the same way every unofficial PSN client (chiaki-ng, psn-api,
// PSNAWP, ...) does it: sign into My PlayStation in an embedded browser,
// then read the `npsso` session token back from Sony's own account API.
//
// That API must be read by actually *navigating* the WebView to it (a
// same-origin top-level load, the same as a user manually visiting the URL
// in their own browser and copying the JSON off the page) rather than by
// fetch()-ing it in the background from whatever page happens to be loaded
// -- ca.account.sony.com has no reason to (and doesn't) send CORS headers
// permitting an arbitrary third-party origin like www.playstation.com to
// read its response, so a background cross-origin fetch there is silently
// blocked by the browser every time, no matter how correctly the user signs
// in. The user is left stuck back on PlayStation's own page with nothing
// ever happening -- exactly the "falls out of the flow" symptom this fixes.
const LOGIN_URL = 'https://www.playstation.com/';
const SSO_COOKIE_URL = 'https://ca.account.sony.com/api/v1/ssocookie';

// Runs after every navigation (react-native-webview re-injects
// injectedJavaScript on each page load). Harmless everywhere except the
// ssocookie page itself: there, Sony renders the session as a raw JSON
// body when visited while signed in, and reading *that page's own*
// document text is same-origin -- no fetch, no CORS.
const CHECK_LOGIN_JS = `
(function() {
  try {
    var text = document.body && document.body.innerText;
    var data = text ? JSON.parse(text) : null;
    if (data && data.npsso) {
      window.ReactNativeWebView.postMessage(JSON.stringify({npsso: data.npsso}));
    }
  } catch (e) {}
})();
true;
`;

export function usePsPlusLogin(navigation: any) {
  const {t} = useTranslation();
  const doneRef = React.useRef(false);
  const [uri, setUri] = React.useState(LOGIN_URL);
  const [checkingLogin, setCheckingLogin] = React.useState(false);
  const [error, setError] = React.useState(false);

  const onMessage = React.useCallback(
    (event: {nativeEvent: {data: string}}) => {
      if (doneRef.current) {
        return;
      }
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.npsso) {
          doneRef.current = true;
          log.info('Captured npsso, signing in');
          setNpsso(data.npsso);
          navigation.goBack();
        }
      } catch (parseError) {
        log.warn('Failed to parse WebView message:', parseError);
      }
    },
    [navigation],
  );

  // The user taps this once they've actually finished signing in on the
  // page above -- there's no reliable way to detect "signed in" purely from
  // playstation.com's own navigation history, since it doesn't redirect to
  // a single predictable post-login URL.
  const onPressSignedIn = React.useCallback(() => {
    setCheckingLogin(true);
    setError(false);
    setUri(SSO_COOKIE_URL);
  }, []);

  // If the ssocookie page finishes loading and still hasn't produced a
  // message (checked shortly after, since onMessage would already have
  // fired synchronously with the page's own load if npsso was present),
  // the user wasn't actually signed in yet -- let them go back and retry.
  const onLoadEnd = React.useCallback(() => {
    if (!checkingLogin || doneRef.current) {
      return;
    }
    setTimeout(() => {
      if (!doneRef.current) {
        setError(true);
        setCheckingLogin(false);
      }
    }, 500);
  }, [checkingLogin]);

  const onRetry = React.useCallback(() => {
    setError(false);
    setCheckingLogin(false);
    setUri(LOGIN_URL);
  }, []);

  return {
    t,
    uri,
    checkingLogin,
    error,
    checkLoginJs: CHECK_LOGIN_JS,
    onMessage,
    onPressSignedIn,
    onLoadEnd,
    onRetry,
  };
}

export type PsPlusLoginViewModel = ReturnType<typeof usePsPlusLogin>;
