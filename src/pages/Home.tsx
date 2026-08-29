import React from 'react';
import {StyleSheet, View, Alert, NativeModules, Linking} from 'react-native';
import {Button, Text, Portal, Modal, Card} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {useIsFocused} from '@react-navigation/native';
import RNRestart from 'react-native-restart';
import {getSettings, saveSettings} from '../store/settingStore';

import Authentication from '../Authentication';
import MsalAuthentication from '../MsalAuthentication';

import {useSelector, useDispatch} from 'react-redux';
import SplashScreen from 'react-native-splash-screen';
import {useTranslation} from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import {debugFactory} from '../utils/debug';
import MsalAuth from '../components/MsalAuth';

const log = debugFactory('HomeScreen');

const {FullScreenManager} = NativeModules;

const HARMOBY_URL =
  'https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh';

const MSAL = 'msal';

// Home is now a pure authentication gate: it drives the XAL/MSAL login flow and,
// once tokens are ready, forwards to the Cloud screen (the app's real landing).
// The Xbox console remote-play ("xhome") flow has been removed.
function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [_, setXalUrl] = React.useState('');
  const [isConnected, setIsConnected] = React.useState(true);
  const [showHarmonyModal, setShowHarmonyModal] = React.useState(false);
  const [showLogin, setShowLogin] = React.useState(false);
  const [showMsalLogin, setShowMsalLogin] = React.useState(false);
  const [showMsal, setShowMsal] = React.useState(false);
  const [msalBtnLoading, setMsalBtnLoading] = React.useState(false);
  const [msalData, setMsalData] = React.useState(null);

  const authentication = useSelector((state: any) => state.authentication);
  const _authentication = React.useRef(authentication);

  const redirect = useSelector((state: any) => state.redirect);
  const _redirect = React.useRef(redirect);

  const isLogined = useSelector((state: any) => state.isLogined);
  const _isLogined = React.useRef(isLogined);

  const webTokenRef = React.useRef(null);

  const dispatch = useDispatch();

  const isFocused = useIsFocused();
  const _isFocused = React.useRef(isFocused);
  React.useEffect(() => {
    _isFocused.current = isFocused;
  }, [isFocused]);

  React.useEffect(() => {
    log.info('Page loaded.');
    SplashScreen.hide();

    const _settings = getSettings();
    const deviceInfos = FullScreenManager.getDeviceInfos();

    // HarmonyOS modal
    if (
      deviceInfos &&
      deviceInfos.factor.indexOf('HUAWEI') > -1 &&
      _settings.locale === 'zh' &&
      _settings.show_harmony_modal
    ) {
      setShowHarmonyModal(true);
    }

    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setIsConnected(state.isConnected);
    });

    if (!isConnected) {
      Alert.alert(
        t('Warning'),
        t('Currently no network connection, please connect and try again'),
        [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {},
          },
        ],
      );
      return;
    } else {
      // Auth completed callback: store tokens and forward to Cloud.
      const authenticationCompleted = async (_streamingTokens, _webToken) => {
        log.info('Authentication completed');
        webTokenRef.current = _webToken;
        dispatch({
          type: 'SET_STREAMING_TOKEN',
          payload: _streamingTokens,
        });
        dispatch({
          type: 'SET_WEB_TOKEN',
          payload: _webToken,
        });
        dispatch({
          type: 'SET_LOGIN',
          payload: true,
        });
        _isLogined.current = true;
        setShowLogin(false);
        setShowMsalLogin(false);
        setShowMsal(false);
        setLoading(false);

        // The dashboard is the app entry point now — replace so back exits the
        // app instead of returning to this login gate.
        navigation.replace('Dashboard');
      };

      // Auth failed callback
      const authenticationFailed = (msg, rollback = false) => {
        if (rollback) {
          // Rollback to MSAL auth
          Alert.alert(t('Error'), t('XalAuthFailDesc') + msg, [
            {
              text: t('Confirm'),
              style: 'default',
              onPress: () => {
                _authentication.current = new MsalAuthentication(
                  authenticationCompleted,
                  authenticationFailed,
                );
                dispatch({
                  type: 'SET_AUTHENTICATION',
                  payload: _authentication.current,
                });
                setShowMsalLogin(true);
              },
            },
          ]);
        } else {
          Alert.alert(t('Error'), t('AuthFailDesc') + msg, [
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
      };

      if (!_authentication.current) {
        log.info('Authentication initial.');

        _authentication.current = new Authentication(
          authenticationCompleted,
          authenticationFailed,
        );
        _authentication.current._tokenStore.load();

        if (
          _settings.use_msal_login ||
          _authentication.current._tokenStore.getAuthenticationMethod() === MSAL
        ) {
          log.info('Using MSAL authentication method.');
          _authentication.current = new MsalAuthentication(
            authenticationCompleted,
            authenticationFailed,
          );
        }
        dispatch({
          type: 'SET_AUTHENTICATION',
          payload: _authentication.current,
        });
      }

      if (_isFocused.current) {
        log.info('HomeScreen isFocused:', _isFocused.current);

        // Return from Login screen(XAL auth)
        if (route.params?.xalUrl) {
          if (!_isLogined.current) {
            log.info('HomeScreen receive xalUrl:', route.params?.xalUrl);
            setXalUrl(route.params.xalUrl);
            setLoading(true);
            setLoadingText(
              t('Login successful, refreshing login credentials...'),
            );
            _authentication.current.startAuthflow(
              _redirect.current,
              route.params.xalUrl,
            );
          }
        } else if (!_isLogined.current) {
          setLoading(true);
          setLoadingText(t('Checking login status...'));
          _authentication.current
            .checkAuthentication()
            .then(isAuth => {
              if (!isAuth) {
                if (_settings.use_msal_login) {
                  setLoading(false);
                  setShowLogin(false);
                  setShowMsalLogin(true);
                  setShowMsal(false);
                } else {
                  _authentication.current._xal
                    .getRedirectUri()
                    .then(redirectObj => {
                      setLoading(false);
                      log.info('Redirect:', redirectObj);
                      _redirect.current = redirectObj;
                      dispatch({
                        type: 'SET_REDIRECT',
                        payload: redirectObj,
                      });
                      setShowLogin(true);
                      setShowMsalLogin(false);
                      setShowMsal(false);
                    })
                    .catch(() => {
                      _authentication.current = new MsalAuthentication(
                        authenticationCompleted,
                        authenticationFailed,
                      );
                      dispatch({
                        type: 'SET_AUTHENTICATION',
                        payload: _authentication.current,
                      });
                      setLoading(false);
                      setShowLogin(false);
                      setShowMsalLogin(true);
                      setShowMsal(false);
                    });
                }
              }
            })
            .catch(e => {
              Alert.alert(t('Error'), e);
              _authentication.current = new MsalAuthentication(
                authenticationCompleted,
                authenticationFailed,
              );
              dispatch({
                type: 'SET_AUTHENTICATION',
                payload: _authentication.current,
              });
              setLoading(false);
              setShowLogin(false);
              setShowMsalLogin(true);
              setShowMsal(false);
            });
        }
      }
    }

    return () => {
      unsubscribe();
    };
  }, [t, route.params?.xalUrl, dispatch, navigation, isConnected]);

  const renderHarmonyModal = () => {
    if (!showHarmonyModal) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={true}
          onDismiss={() => {
            setShowHarmonyModal(false);
          }}
          contentContainerStyle={{marginLeft: '4%', marginRight: '4%'}}>
          <Card>
            <Card.Content>
              <Text>
                XStreaming鸿蒙版已正式发布App Gallery，如您的设备系统为HarmonyOS
                5以上，您可以安装原生版本以获得更好的串流体验(点击立即下载或应用商店搜索"XStreaming"进行安装)。
              </Text>

              <Button
                mode="text"
                onPress={() => {
                  let _settings = getSettings();
                  _settings.show_harmony_modal = false;
                  saveSettings(_settings);
                  setShowHarmonyModal(false);
                }}>
                不再提示
              </Button>
              <Button
                mode="elevated"
                onPress={() => {
                  Linking.openURL(HARMOBY_URL);
                  setShowHarmonyModal(false);
                }}>
                去安装
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const handleLogin = () => {
    if (_redirect.current && _redirect.current.sisuAuth) {
      navigation.navigate('Login', {
        authUrl: _redirect.current.sisuAuth.MsaOauthRedirect,
      });
    }
  };

  const handleMsalLogin = () => {
    setMsalBtnLoading(true);
    _authentication.current
      .getMsalDeviceCode()
      .then(data => {
        log.info('MSAL device code response:', data);
        _authentication.current.doPollForDeviceCodeAuth(data.device_code);
        setMsalData(data);
        setShowMsalLogin(false);
        setShowMsal(true);
        setMsalBtnLoading(false);
      })
      .catch(e => {
        log.error('MSAL device code error:', e);
        Alert.alert(t('Error'), 'MSAL device code error' + e, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              setMsalBtnLoading(false);
            },
          },
        ]);
      });
  };

  const renderLogin = () => {
    return (
      <View>
        <Text style={styles.title}>{t('NoLogin')}</Text>
        <Button mode="outlined" onPress={handleLogin}>
          &nbsp;{t('Login')}&nbsp;
        </Button>

        <Button
          style={styles.mt10}
          mode="text"
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderMsalLogin = () => {
    return (
      <View>
        <Button
          mode="outlined"
          loading={msalBtnLoading}
          onPress={handleMsalLogin}>
          &nbsp;{t('AuthLogin')}&nbsp;
        </Button>

        <Button
          style={styles.mt10}
          mode="text"
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return null;
    }
    if (showLogin) {
      return <View style={styles.centerContainer}>{renderLogin()}</View>;
    } else if (showMsalLogin) {
      return <View style={styles.centerContainer}>{renderMsalLogin()}</View>;
    } else if (showMsal) {
      return (
        <View style={styles.centerContainer}>
          <MsalAuth data={msalData} />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.root}>
      <Spinner loading={loading} text={loadingText} />

      {renderHarmonyModal()}

      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  mt10: {
    marginTop: 10,
  },
});

export default HomeScreen;
