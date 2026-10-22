import React from 'react';
import {Alert} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {useTranslation} from 'react-i18next';
import {ensureAuthentication, runSilentAuthCheck} from '../api/authSession';

// App-level startup for Xbox authentication. Replaces what the Home screen
// used to do on every launch: create the authentication object (Settings and
// the stream screens read it from Redux, so it must exist before they
// render) and run the silent token refresh once the device is online. No
// screen is involved, so nothing can be left waiting on one.
export function useXboxAuthBootstrap(): void {
  const {t} = useTranslation();

  // Synchronous and idempotent: runs before the first child render.
  React.useState(() => ensureAuthentication());

  React.useEffect(() => {
    let checked = false;
    let warned = false;
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        if (!checked) {
          checked = true;
          runSilentAuthCheck();
        }
        return;
      }
      // Offline: skip the refresh (a failed refresh would clear the saved
      // tokens) and tell the user once; it runs when the network returns.
      if (state.isConnected === false && !warned) {
        warned = true;
        Alert.alert(
          t('Warning'),
          t('Currently no network connection, please connect and try again'),
          [{text: t('Confirm'), style: 'default'}],
        );
      }
    });
    return unsubscribe;
  }, [t]);
}
