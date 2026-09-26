import React from 'react';
import {WebView} from 'react-native-webview';
import Spinner from '../../../shared/ui/Spinner';
import type {LoginScreenViewModel} from '../model/useLoginScreen';

type Props = LoginScreenViewModel;

const LoginView: React.FC<Props> = ({
  authUrl,
  onShouldStartLoadWithRequest,
  onNavigationStateChange,
}) => {
  if (authUrl === '') {
    return null;
  }
  return (
    <WebView
      source={{uri: authUrl}}
      originWhitelist={['*']}
      startInLoadingState={true}
      renderLoading={() => <Spinner loading={true} cancelable={true} />}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onNavigationStateChange={onNavigationStateChange}
    />
  );
};

export default LoginView;
