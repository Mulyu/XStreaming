import React from 'react';
import {debugFactory} from '../../../shared/lib/debug';
import {setNpsso} from '../../../features/ps-plus-session';

const log = debugFactory('PsPlusLoginScreen');

// PSN has no OAuth device-code flow like GFN's, so cloud streaming auth
// works the same way every unofficial PSN client (chiaki-ng, psn-api,
// PSNAWP, ...) does it: let the user sign into My PlayStation in an embedded
// browser, then read the `npsso` session cookie back via Sony's own account
// API rather than scraping document.cookie directly (that API is also how
// the WebView's own JS confirms login succeeded, since a same-origin `fetch`
// there carries the session cookie automatically).
const LOGIN_URL = 'https://www.playstation.com/';
const SSO_COOKIE_URL = 'https://ca.account.sony.com/api/v1/ssocookie';

// react-native-webview re-runs injectedJavaScript after every navigation, so
// this fires again on every page the user lands on during login -- it's a
// no-op until the sign-in flow actually completes.
const CHECK_LOGIN_JS = `
(function() {
  fetch('${SSO_COOKIE_URL}', {credentials: 'include'})
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(json) {
      if (json && json.npsso) {
        window.ReactNativeWebView.postMessage(JSON.stringify({npsso: json.npsso}));
      }
    })
    .catch(function() {});
})();
true;
`;

export function usePsPlusLogin(navigation: any) {
  const doneRef = React.useRef(false);

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
      } catch (error) {
        log.warn('Failed to parse WebView message:', error);
      }
    },
    [navigation],
  );

  return {
    loginUrl: LOGIN_URL,
    checkLoginJs: CHECK_LOGIN_JS,
    onMessage,
  };
}

export type PsPlusLoginViewModel = ReturnType<typeof usePsPlusLogin>;
