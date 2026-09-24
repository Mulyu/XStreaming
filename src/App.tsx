import React from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Linking,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Dialog,
  PaperProvider,
  MD3DarkTheme,
  Portal,
  ProgressBar,
  Text,
  adaptNavigationTheme,
} from 'react-native-paper';

import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  createNavigationContainerRef,
  NavigationContainer,
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';

import merge from 'deepmerge';
import {Provider} from 'react-redux';
import store from './store';
import {getSettings} from './store/settingStore';
import {findTitleByProductId, getTitleStreamingId} from './store/shortcutStore';

import customDarkTheme from './shared/config/theme';

import HomeScreen from './pages/Home';
import LoginScreen from './pages/Login';
import NativeStreamScreen from './pages/NativeStream';
import NativePortraitStreamScreen from './pages/NativePortraitStream';
import SettingsScreen from './pages/Settings';
import LibraryScreen from './pages/Library';
import LibraryTitleDetailScreen from './pages/LibraryTitleDetail';
import StoreScreen from './pages/Store';
import NativeGameMapScreen from './pages/NativeGameMap';
import GameMapDetailScreen from './pages/GameMapDetail';
import VirtualGamepadSettingsScreen from './pages/VirtualGamepadSettings';
import CustomGamepadScreen from './pages/CustomGamepad';
import Ds5SettingsScreen from './pages/Ds5Settings';
import HistoryScreen from './pages/History';
import updater from './utils/updater';
import {
  applyPrimaryColorToPaperTheme,
  DEFAULT_THEME_PRIMARY_COLOR,
} from './utils/themeColor';

import {useTranslation} from 'react-i18next';

import {SystemBars} from 'react-native-edge-to-edge';

import './i18n';
import HubTabBar from './components/HubTabBar';

const RootStack = createStackNavigator();
const MainTab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<any>();

const {UpdateManager, ShortcutManager} = NativeModules;
const UPDATE_PROGRESS_EVENT = 'UpdateManagerProgress';
const TITLE_SHORTCUT_EVENT = 'onTitleShortcutOpen';

const formatUpdateBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }

  const mb = bytes / 1024 / 1024;
  return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB`;
};

const {DarkTheme} = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const PAGE_BACKGROUND_DARK = '#0E0E10';

const withPageBackground = (ScreenComponent: any) => {
  const WrappedScreen = (props: any) => {
    return (
      <View style={[styles.backgroundScreen, styles.backgroundScreenDark]}>
        <View style={styles.backgroundContent}>
          <ScreenComponent {...props} />
        </View>
      </View>
    );
  };

  WrappedScreen.displayName = `WithPageBackground(${
    ScreenComponent.displayName || ScreenComponent.name || 'Screen'
  })`;
  return WrappedScreen;
};

// Tab screens have no stack header, so they must reserve the status-bar area
// themselves (the header used to do this). Same page background as above, plus
// the top safe-area inset so content isn't drawn under the status bar.
const withTabScreen = (ScreenComponent: any) => {
  const WrappedScreen = (props: any) => {
    const insets = useSafeAreaInsets();

    return (
      <View
        style={[
          styles.backgroundScreen,
          styles.backgroundScreenDark,
          {paddingTop: insets.top},
        ]}>
        <View style={styles.backgroundContent}>
          <ScreenComponent {...props} />
        </View>
      </View>
    );
  };

  WrappedScreen.displayName = `WithTabScreen(${
    ScreenComponent.displayName || ScreenComponent.name || 'Screen'
  })`;
  return WrappedScreen;
};

const LibraryTabScreen = withTabScreen(LibraryScreen);
const StoreTabScreen = withTabScreen(StoreScreen);
const SettingsTabScreen = withTabScreen(SettingsScreen);

const HomeBackgroundScreen = withPageBackground(HomeScreen);
const LoginBackgroundScreen = withPageBackground(LoginScreen);
const LibraryTitleDetailBackgroundScreen = withPageBackground(
  LibraryTitleDetailScreen,
);
const NativeGameMapBackgroundScreen = withPageBackground(NativeGameMapScreen);
const GameMapDetailBackgroundScreen = withPageBackground(GameMapDetailScreen);
const VirtualGamepadSettingsBackgroundScreen = withPageBackground(
  VirtualGamepadSettingsScreen,
);
const Ds5SettingsBackgroundScreen = withPageBackground(Ds5SettingsScreen);
const HistoryBackgroundScreen = withPageBackground(HistoryScreen);

// The two hub screens live in a bottom-tab navigator so the tab bar persists
// and only the content swaps between them (Library / Settings). Detail,
// stream and settings sub-screens are pushed on the root stack, above the
// tabs, so they open full-screen without a tab bar.
// Library merges the xCloud and GeForce NOW catalogs into one grid (see
// src/pages/Library.tsx), which has since absorbed the previous separate
// Cloud/Gfn tabs' rating/popularity sorting -- those two screens were
// removed once Library.tsx carried the same functionality.
function MainTabs() {
  return (
    <MainTab.Navigator
      screenOptions={{headerShown: false}}
      tabBar={props => <HubTabBar {...props} />}>
      <MainTab.Screen name="Library" component={LibraryTabScreen} />
      <MainTab.Screen name="Store" component={StoreTabScreen} />
      <MainTab.Screen name="Settings" component={SettingsTabScreen} />
    </MainTab.Navigator>
  );
}

function App() {
  const {t} = useTranslation();
  const settings = getSettings();
  const updateCheckedRef = React.useRef(false);
  const pendingTitleShortcutRef = React.useRef<any>(null);
  const [updateProgressVisible, setUpdateProgressVisible] =
    React.useState(false);
  const [updateProgress, setUpdateProgress] = React.useState({
    downloadedBytes: 0,
    progress: 0,
    status: 'idle',
    totalBytes: 0,
  });

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      UPDATE_PROGRESS_EVENT,
      (event: any) => {
        setUpdateProgress({
          downloadedBytes: Number(event?.downloadedBytes) || 0,
          progress: Number(event?.progress) || 0,
          status: event?.status || 'downloading',
          totalBytes: Number(event?.totalBytes) || 0,
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const openTitleShortcut = React.useCallback(
    (shortcut: any) => {
      const isGfn = shortcut?.provider === 'gfn';
      if (!isGfn && !shortcut?.productId) {
        return;
      }
      if (isGfn && !shortcut?.gfnAppId) {
        return;
      }

      if (!navigationRef.isReady()) {
        pendingTitleShortcutRef.current = shortcut;
        return;
      }

      if (isGfn) {
        // GFN never needed a saved snapshot to relaunch -- the shortcut's own
        // Intent extras already carry everything NativeStream needs to start
        // streaming (see shortcutStore.ts's TitleShortcutSnapshot).
        navigationRef.navigate('NativeStream', {
          streamType: 'gfn',
          appId: shortcut.gfnAppId,
          title: shortcut.titleName,
        });
        return;
      }

      const titleItem = findTitleByProductId(shortcut.productId);
      if (!titleItem) {
        Alert.alert(t('Warning'), t('TitleShortcutExpired'));
        return;
      }

      const sessionId = getTitleStreamingId(titleItem);
      if (!sessionId) {
        Alert.alert(t('Warning'), t('TitleShortcutExpired'));
        return;
      }
      const postUrl = titleItem.Image_Poster?.URL
        ? `https:${titleItem.Image_Poster.URL}`
        : '';
      navigationRef.navigate({
        name: getSettings().native_portrait_mode
          ? 'NativePortraitStream'
          : 'NativeStream',
        params: {
          sessionId,
          streamType: 'cloud',
          postUrl,
          title: titleItem.ProductTitle || '',
        },
      });
    },
    [t],
  );

  React.useEffect(() => {
    if (!ShortcutManager?.getInitialShortcut) {
      return;
    }

    ShortcutManager.getInitialShortcut()
      .then((shortcut: any) => {
        openTitleShortcut(shortcut);
      })
      .catch(() => {});

    const subscription = DeviceEventEmitter.addListener(
      TITLE_SHORTCUT_EVENT,
      openTitleShortcut,
    );

    return () => {
      subscription.remove();
    };
  }, [openTitleShortcut]);

  React.useEffect(() => {
    if (!settings.check_update || updateCheckedRef.current) {
      return;
    }

    updateCheckedRef.current = true;
    updater().then((infos: any) => {
      if (infos) {
        const {latestVer, version, updateText, pageUrl, apkUrl, apkName, url} =
          infos;
        const updateUrl = pageUrl || url;
        const buttons: any[] = [
          {
            text: t('Cancel'),
            style: 'default',
            onPress: () => {},
          },
          {
            text: t('Manual download'),
            style: 'default',
            onPress: () => {
              Linking.openURL(updateUrl).catch(_ => {});
            },
          },
        ];

        if (apkUrl) {
          buttons.push({
            text: t('Auto install'),
            style: 'default',
            onPress: () => {
              const showAutoInstallError = (e?: any) => {
                setUpdateProgressVisible(false);
                const message =
                  e?.code === 'INSTALL_PERMISSION_REQUIRED'
                    ? t('InstallPermissionRequired')
                    : t('AutoInstallFailed');
                Alert.alert(t('Warning'), message, [
                  {
                    text: t('Manual download'),
                    style: 'default',
                    onPress: () => {
                      Linking.openURL(updateUrl).catch(_ => {});
                    },
                  },
                  {
                    text: t('Confirm'),
                    style: 'cancel',
                  },
                ]);
              };

              if (!UpdateManager?.downloadAndInstall) {
                showAutoInstallError();
                return;
              }

              setUpdateProgress({
                downloadedBytes: 0,
                progress: 0,
                status: 'downloading',
                totalBytes: 0,
              });
              setUpdateProgressVisible(true);
              UpdateManager.downloadAndInstall(apkUrl, apkName).catch(
                showAutoInstallError,
              );
            },
          });
        }

        Alert.alert(
          t('Update Warning'),
          t(
            `Check new version ${latestVer}, current version is ${version}. \n ${updateText}`,
          ),
          buttons,
        );
      }
    });
  }, [settings.check_update, t]);

  const paperDarkTheme = applyPrimaryColorToPaperTheme(
    {
      ...MD3DarkTheme,
      colors: customDarkTheme.colors,
    },
    'dark',
    DEFAULT_THEME_PRIMARY_COLOR,
  );
  const CombinedDarkTheme = merge(paperDarkTheme, DarkTheme);
  CombinedDarkTheme.colors.background = PAGE_BACKGROUND_DARK;
  CombinedDarkTheme.colors.card = PAGE_BACKGROUND_DARK;

  const paperTheme = paperDarkTheme;
  const navigationTheme = CombinedDarkTheme;

  const hasDownloadTotal = updateProgress.totalBytes > 0;
  const normalizedUpdateProgress = hasDownloadTotal
    ? Math.max(0, Math.min(updateProgress.progress, 1))
    : 0;
  const updateProgressPercent = Math.round(normalizedUpdateProgress * 100);
  const updateProgressText =
    updateProgress.status === 'installing' ||
    updateProgress.status === 'completed'
      ? t('Preparing installation')
      : hasDownloadTotal
      ? `${t('Downloaded')} ${updateProgressPercent}% (${formatUpdateBytes(
          updateProgress.downloadedBytes,
        )} / ${formatUpdateBytes(updateProgress.totalBytes)})`
      : `${t('Downloaded')} ${formatUpdateBytes(
          updateProgress.downloadedBytes,
        )}`;

  return (
    <>
      <Provider store={store}>
        <PaperProvider theme={paperTheme}>
          <NavigationContainer
            ref={navigationRef}
            theme={navigationTheme}
            onReady={() => {
              if (pendingTitleShortcutRef.current) {
                const shortcut = pendingTitleShortcutRef.current;
                pendingTitleShortcutRef.current = null;
                openTitleShortcut(shortcut);
              }
            }}>
            <RootStack.Navigator>
              <RootStack.Group>
                <RootStack.Screen
                  name="Home"
                  component={HomeBackgroundScreen}
                  options={{
                    headerShown: false,
                    cardStyle: styles.transparentCard,
                  }}
                />
                <RootStack.Screen
                  name="Main"
                  component={MainTabs}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="Login"
                  component={LoginBackgroundScreen}
                  options={{title: t('Login')}}
                />
                <RootStack.Screen
                  name="NativeStream"
                  component={NativeStreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="NativePortraitStream"
                  component={NativePortraitStreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="CustomGamepad"
                  component={CustomGamepadScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="VirtualGamepadSettings"
                  component={VirtualGamepadSettingsBackgroundScreen}
                  options={{title: t('Custom')}}
                />
                <RootStack.Screen
                  name="History"
                  component={HistoryBackgroundScreen}
                  options={{title: t('HistoryTitle')}}
                />
                <RootStack.Screen
                  name="NativeGameMap"
                  component={NativeGameMapBackgroundScreen}
                  options={{title: t('GameMap')}}
                />
                <RootStack.Screen
                  name="Ds5"
                  component={Ds5SettingsBackgroundScreen}
                  options={{title: t('DualSense')}}
                />
              </RootStack.Group>

              <RootStack.Group screenOptions={{presentation: 'modal'}}>
                <RootStack.Screen
                  name="LibraryTitleDetail"
                  component={LibraryTitleDetailBackgroundScreen}
                />
                <RootStack.Screen
                  name="GameMapDetail"
                  component={GameMapDetailBackgroundScreen}
                  options={{title: t('GameMap')}}
                />
              </RootStack.Group>
            </RootStack.Navigator>
          </NavigationContainer>
          <Portal>
            <Dialog
              visible={updateProgressVisible}
              onDismiss={() => setUpdateProgressVisible(false)}>
              <Dialog.Title>{t('Update download')}</Dialog.Title>
              <Dialog.Content>
                <Text style={styles.updateProgressText}>
                  {updateProgressText}
                </Text>
                <ProgressBar
                  progress={normalizedUpdateProgress}
                  indeterminate={!hasDownloadTotal}
                />
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setUpdateProgressVisible(false)}>
                  {t('Hide')}
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </PaperProvider>
      </Provider>
      <SystemBars style="light" hidden={false} />
    </>
  );
}

const styles = StyleSheet.create({
  backgroundScreen: {
    flex: 1,
  },
  backgroundScreenDark: {
    backgroundColor: PAGE_BACKGROUND_DARK,
  },
  backgroundContent: {
    flex: 1,
  },
  transparentCard: {
    backgroundColor: 'transparent',
  },
  updateProgressText: {
    marginBottom: 12,
  },
});

export default App;
