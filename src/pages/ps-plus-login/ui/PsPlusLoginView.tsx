import React from 'react';
import {View, StyleSheet} from 'react-native';
import {WebView} from 'react-native-webview';
import {Text, Button} from 'react-native-paper';
import Spinner from '../../../shared/ui/Spinner';
import type {PsPlusLoginViewModel} from '../model/usePsPlusLogin';

type Props = PsPlusLoginViewModel;

const PsPlusLoginView: React.FC<Props> = ({
  t,
  uri,
  checkingLogin,
  error,
  checkLoginJs,
  onMessage,
  onPressSignedIn,
  onLoadEnd,
  onRetry,
}) => {
  return (
    <View style={styles.container}>
      <WebView
        source={{uri}}
        originWhitelist={['*']}
        sharedCookiesEnabled={true}
        startInLoadingState={true}
        renderLoading={() => <Spinner loading={true} cancelable={true} />}
        injectedJavaScript={checkLoginJs}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
      />
      {!checkingLogin && !error && (
        <View style={styles.bar}>
          <Text style={styles.barText}>{t('PsPlusLoginPrompt')}</Text>
          <Button mode="contained" onPress={onPressSignedIn}>
            {t('PsPlusSignedInButton')}
          </Button>
        </View>
      )}
      {error && (
        <View style={styles.bar}>
          <Text style={styles.barText}>{t('PsPlusLoginFailedDesc')}</Text>
          <Button mode="contained" onPress={onRetry}>
            {t('Retry')}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  barText: {
    color: '#fff',
    textAlign: 'center',
  },
});

export default PsPlusLoginView;
