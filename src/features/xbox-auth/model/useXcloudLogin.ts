import React from 'react';
import {Alert} from 'react-native';
import RNRestart from 'react-native-restart';
import {useDispatch, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../../../shared/lib/debug';
import {getSettings} from '../../../shared/lib/settings';
import {
  ensureAuthentication,
  setInteractiveFailureHandler,
  switchToMsalAuthentication,
} from '../api/authSession';

const log = debugFactory('useXcloudLogin');

// The interactive xCloud (Xbox) sign-in, driven from the Settings account
// row. XAL: fetch the redirect, open the Login WebView screen (which comes
// back to Settings with `xalUrl`), then finish the flow. MSAL: request a
// device code and show it. Either way the result lands in Redux, which is
// also how this hook knows to stop waiting.
export function useXcloudLogin(navigation: any, route: any) {
  const {t} = useTranslation();
  const dispatch = useDispatch();
  const isLogined = useSelector((state: any) => state.isLogined);
  const redirect = useSelector((state: any) => state.redirect);

  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [msalData, setMsalData] = React.useState<any>(null);
  // Failures are only worth interrupting the user for while a sign-in they
  // started is in progress.
  const activeRef = React.useRef(false);

  const stop = React.useCallback(() => {
    activeRef.current = false;
    setLoading(false);
    setMsalData(null);
  }, []);

  const startMsal = React.useCallback(
    (authentication: any) => {
      if (typeof authentication?.getMsalDeviceCode !== 'function') {
        authentication = switchToMsalAuthentication();
      }
      setLoading(true);
      setLoadingText(t('Loading...'));
      authentication
        .getMsalDeviceCode()
        .then((data: any) => {
          log.info('MSAL device code response:', data);
          authentication.doPollForDeviceCodeAuth(data.device_code);
          setMsalData(data);
          setLoading(false);
        })
        .catch((e: any) => {
          log.error('MSAL device code error:', e);
          stop();
          Alert.alert(t('Error'), 'MSAL device code error' + e);
        });
    },
    [stop, t],
  );

  React.useEffect(() => {
    setInteractiveFailureHandler((message, rollback) => {
      if (!activeRef.current) {
        log.info('Silent xCloud auth check failed (non-blocking):', message);
        return;
      }
      stop();
      if (rollback) {
        // The XAL flow failed: offer the MSAL device-code flow instead.
        Alert.alert(t('Error'), t('XalAuthFailDesc') + message, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              activeRef.current = true;
              startMsal(switchToMsalAuthentication());
            },
          },
        ]);
      } else {
        Alert.alert(t('Error'), t('AuthFailDesc') + message, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              // Restart application to relogin
              RNRestart.restart();
            },
          },
        ]);
      }
    });
    return () => setInteractiveFailureHandler(null);
  }, [startMsal, stop, t]);

  // Signed in (by any path): nothing left to wait for.
  React.useEffect(() => {
    if (isLogined && activeRef.current) {
      stop();
    }
  }, [isLogined, stop]);

  const startLogin = React.useCallback(async () => {
    const authentication = ensureAuthentication();
    activeRef.current = true;
    setLoading(true);
    setLoadingText(t('Checking login status...'));
    try {
      const hasTokens = await authentication.checkAuthentication();
      if (hasTokens) {
        // Saved tokens are being refreshed in the background; the loading
        // state ends when Redux reports the sign-in.
        return;
      }
      if (getSettings().use_msal_login) {
        startMsal(authentication);
        return;
      }
      try {
        const redirectObj = await authentication._xal.getRedirectUri();
        log.info('Redirect:', redirectObj);
        dispatch({type: 'SET_REDIRECT', payload: redirectObj});
        setLoading(false);
        navigation.navigate('Login', {
          authUrl: redirectObj.sisuAuth.MsaOauthRedirect,
        });
      } catch (e) {
        log.info('getRedirectUri failed, falling back to MSAL:', e);
        startMsal(switchToMsalAuthentication());
      }
    } catch (e: any) {
      Alert.alert(t('Error'), String(e));
      startMsal(switchToMsalAuthentication());
    }
  }, [dispatch, navigation, startMsal, t]);

  // Back from the Login screen with the XAL redirect URL: finish the flow.
  const xalUrl: string | undefined = route?.params?.xalUrl;
  React.useEffect(() => {
    if (!xalUrl) {
      return;
    }
    navigation.setParams({xalUrl: undefined});
    if (isLogined) {
      return;
    }
    log.info('Settings received xalUrl:', xalUrl);
    activeRef.current = true;
    setLoading(true);
    setLoadingText(t('Login successful, refreshing login credentials...'));
    ensureAuthentication().startAuthflow(redirect, xalUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xalUrl]);

  return {
    xcloudLoginLoading: loading,
    xcloudLoginText: loadingText,
    msalData,
    startXcloudLogin: startLogin,
    cancelXcloudLogin: stop,
  };
}
