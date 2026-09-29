import React from 'react';
import {WebView} from 'react-native-webview';
import Spinner from '../../../shared/ui/Spinner';
import type {PsPlusLoginViewModel} from '../model/usePsPlusLogin';

type Props = PsPlusLoginViewModel;

const PsPlusLoginView: React.FC<Props> = ({
  loginUrl,
  checkLoginJs,
  onMessage,
}) => (
  <WebView
    source={{uri: loginUrl}}
    originWhitelist={['*']}
    sharedCookiesEnabled={true}
    startInLoadingState={true}
    renderLoading={() => <Spinner loading={true} cancelable={true} />}
    injectedJavaScript={checkLoginJs}
    onMessage={onMessage}
  />
);

export default PsPlusLoginView;
