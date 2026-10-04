import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Button, Text, Portal, Modal, Card} from 'react-native-paper';
import Spinner from '../../../shared/ui/Spinner';
import {MsalAuth} from '../../../entities/xbox-token';
import type {HomeScreenViewModel} from '../model/useHomeScreen';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';

type Props = HomeScreenViewModel;

// Pure presentational component -- no hooks. Everything it needs (state,
// translated strings via `t`, and every handler) comes in as props from
// useHomeScreen(); see architecture.md's "Page slices specifically" note.
const HomeView: React.FC<Props> = ({
  t,
  loading,
  loadingText,
  showHarmonyModal,
  showLogin,
  showMsalLogin,
  showMsal,
  msalBtnLoading,
  msalData,
  onDismissHarmonyModal,
  onDisableHarmonyModal,
  onInstallHarmony,
  onLogin,
  onMsalLogin,
  onNavigateSettings,
}) => {
  const disableHarmonyFocus = useTVFocus();
  const installHarmonyFocus = useTVFocus();
  const loginFocus = useTVFocus();
  const loginSettingsFocus = useTVFocus();
  const msalLoginFocus = useTVFocus();
  const msalSettingsFocus = useTVFocus();

  const renderHarmonyModal = () => {
    if (!showHarmonyModal) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={true}
          onDismiss={onDismissHarmonyModal}
          contentContainerStyle={{marginLeft: '4%', marginRight: '4%'}}>
          <Card>
            <Card.Content>
              <Text>
                XStreaming鸿蒙版已正式发布App Gallery，如您的设备系统为HarmonyOS
                5以上，您可以安装原生版本以获得更好的串流体验(点击立即下载或应用商店搜索"XStreaming"进行安装)。
              </Text>

              <Button
                mode="text"
                onPress={onDisableHarmonyModal}
                onFocus={disableHarmonyFocus.onFocus}
                onBlur={disableHarmonyFocus.onBlur}
                style={disableHarmonyFocus.focused && tvFocusRing}>
                不再提示
              </Button>
              <Button
                mode="elevated"
                onPress={onInstallHarmony}
                onFocus={installHarmonyFocus.onFocus}
                onBlur={installHarmonyFocus.onBlur}
                style={installHarmonyFocus.focused && tvFocusRing}>
                去安装
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderLogin = () => {
    return (
      <View>
        <Text style={styles.title}>{t('NoLogin')}</Text>
        <Button
          mode="outlined"
          onPress={onLogin}
          onFocus={loginFocus.onFocus}
          onBlur={loginFocus.onBlur}
          style={loginFocus.focused && tvFocusRing}>
          &nbsp;{t('Login')}&nbsp;
        </Button>

        <Button
          style={[styles.mt10, loginSettingsFocus.focused && tvFocusRing]}
          mode="text"
          onPress={onNavigateSettings}
          onFocus={loginSettingsFocus.onFocus}
          onBlur={loginSettingsFocus.onBlur}>
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
          onPress={onMsalLogin}
          onFocus={msalLoginFocus.onFocus}
          onBlur={msalLoginFocus.onBlur}
          style={msalLoginFocus.focused && tvFocusRing}>
          &nbsp;{t('AuthLogin')}&nbsp;
        </Button>

        <Button
          style={[styles.mt10, msalSettingsFocus.focused && tvFocusRing]}
          mode="text"
          onPress={onNavigateSettings}
          onFocus={msalSettingsFocus.onFocus}
          onBlur={msalSettingsFocus.onBlur}>
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
};

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

export default HomeView;
