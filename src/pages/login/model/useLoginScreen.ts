import React from 'react';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('LoginScreen');

export function useLoginScreen(navigation: any, route: any) {
  const [authUrl, setAuthUrl] = React.useState('');

  React.useEffect(() => {
    if (route.params?.authUrl) {
      log.info('Receive authUrl:', route.params?.authUrl);
      setAuthUrl(route.params?.authUrl);
    }
  }, [route.params?.authUrl]);

  const onShouldStartLoadWithRequest = (request: {url: string}) => {
    // log.info('onShouldStartLoadWithRequest:', request);
    if (request.url.startsWith('ms-xal-000000004c20a908:')) {
      return false;
    }
    return true;
  };

  const onNavigationStateChange = (navState: {url: string}) => {
    // Keep track of going back navigation within component
    // log.info('onNavigationStateChange:', navState);
    const {url} = navState;
    if (url.startsWith('ms-xal-000000004c20a908:')) {
      // Save url，return to home
      navigation.navigate({
        name: 'Home',
        params: {xalUrl: url},
        merge: true,
      });
    }
  };

  return {
    authUrl,
    onShouldStartLoadWithRequest,
    onNavigationStateChange,
  };
}

export type LoginScreenViewModel = ReturnType<typeof useLoginScreen>;
