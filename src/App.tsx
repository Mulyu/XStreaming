import React from 'react';
import {
  Alert,
  AppState,
  DeviceEventEmitter,
  Linking,
  NativeModules,
  Platform,
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

// TEMPORARY diagnostic aid -- see its own file comment.

import {GestureHandlerRootView} from 'react-native-gesture-handler';
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
import store from './shared/lib/reduxStore';
import {getSettings} from './shared/lib/settings';
import {
  findTitleByProductId,
  findPsPlusGameByProductId,
  getTitleStreamingId,
  recordRecentLaunch,
} from './features/launch-title';
import {normalizeTitle, recordTitlePlayed} from './entities/catalog-title';
import {appDebugLog} from './shared/lib/appDebugLog';

import customDarkTheme from './shared/config/theme';
import SplashScreen from 'react-native-splash-screen';
import {useXboxAuthBootstrap} from './features/xbox-auth';

import LoginScreen from './pages/login';
import NativeStreamScreen from './pages/native-stream';
import NativePortraitStreamScreen from './pages/native-stream/portrait';
import SettingsScreen from './pages/settings';
import LibraryScreen from './pages/library';
import LibraryTitleDetailScreen from './pages/library-title-detail';
import StoreScreen from './pages/store';
import NativeGameMapScreen from './pages/native-game-map';
import GameMapDetailScreen from './pages/game-map-detail';
import VirtualGamepadSettingsScreen from './pages/virtual-gamepad-settings';
import InputMappingScreen from './pages/input-mapping';
import CustomGamepadScreen from './pages/custom-gamepad';
import Ds5SettingsScreen from './pages/ds5-settings';
import HistoryScreen from './pages/history';
import PsPlusLoginScreen from './pages/ps-plus-login';
import PsPlusStreamScreen from './pages/ps-plus-stream';
import updater from './shared/lib/updater';

import {useTranslation} from 'react-i18next';

import {SystemBars} from 'react-native-edge-to-edge';

import './i18n';
import {HubTabBar, TV_RAIL_WIDTH} from './widgets/hub-tab-bar';
import {useTVFocus, tvFocusRing} from './shared/ui/tvFocus';
import {palette} from './shared/config/palette';

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

const PAGE_BACKGROUND_DARK = palette.bg;

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
//
// On TV, HubTabBar renders as a left rail that overlays the content instead
// of taking its own row (see HubTabBar.tsx's own comment on why), so this is
// also the one place that reserves TV_RAIL_WIDTH of left padding -- every tab
// screen goes through here, so it only needs doing once.
const TAB_SCREEN_LEFT_PADDING = Platform.isTV ? TV_RAIL_WIDTH : 0;

const withTabScreen = (ScreenComponent: any) => {
  const WrappedScreen = (props: any) => {
    const insets = useSafeAreaInsets();

    return (
      <View
        style={[
          styles.backgroundScreen,
          styles.backgroundScreenDark,
          {
            paddingTop: insets.top,
            paddingLeft: TAB_SCREEN_LEFT_PADDING,
          },
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

const LoginBackgroundScreen = withPageBackground(LoginScreen);
const LibraryTitleDetailBackgroundScreen = withPageBackground(
  LibraryTitleDetailScreen,
);
const NativeGameMapBackgroundScreen = withPageBackground(NativeGameMapScreen);
const GameMapDetailBackgroundScreen = withPageBackground(GameMapDetailScreen);
const VirtualGamepadSettingsBackgroundScreen = withPageBackground(
  VirtualGamepadSettingsScreen,
);
const InputMappingBackgroundScreen = withPageBackground(InputMappingScreen);
const Ds5SettingsBackgroundScreen = withPageBackground(Ds5SettingsScreen);
const PsPlusLoginBackgroundScreen = withPageBackground(PsPlusLoginScreen);
const HistoryBackgroundScreen = withPageBackground(HistoryScreen);

// The two hub screens live in a bottom-tab navigator so the tab bar persists
// and only the content swaps between them (Library / Settings). Detail,
// stream and settings sub-screens are pushed on the root stack, above the
// tabs, so they open full-screen without a tab bar.
// Library merges the xCloud and GeForce NOW catalogs into one grid (see
// src/pages/library/), which has since absorbed the previous separate
// Cloud/Gfn tabs' rating/popularity sorting -- those two screens were
// removed once Library carried the same functionality.
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
  // Xbox authentication object + launch-time silent token refresh -- see
  // features/xbox-auth. Runs for the whole app; no screen gates on it.
  useXboxAuthBootstrap();
  const updateHideFocus = useTVFocus();
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

  // Lands in the same shared log/timeline as MainActivity's own
  // onCreate/onResume/onPause/onDestroy calls to AppDebugLog.log() -- see
  // shared/lib/appDebugLog.ts's own comment on why this exists (diagnosing
  // reports like the Home/Library screen occasionally coming back black
  // after the app is backgrounded and resumed, which isn't specific to any
  // one screen or streaming provider and so has nowhere else to log to).
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      appDebugLog('AppState', `change -> ${nextState}`);
    });
    appDebugLog('AppState', `initial -> ${AppState.currentState}`);
    return () => {
      subscription.remove();
    };
  }, []);

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
      const isPsPlus = shortcut?.provider === 'psplus';
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
        // streaming (see features/launch-title's TitleShortcutSnapshot).
        if (shortcut.titleName) {
          recordTitlePlayed(normalizeTitle(shortcut.titleName));
          recordRecentLaunch({
            provider: 'gfn',
            appId: shortcut.gfnAppId,
            store: shortcut.gfnStore || '',
            title: shortcut.titleName,
          });
        }
        navigationRef.navigate('NativeStream', {
          streamType: 'gfn',
          appId: shortcut.gfnAppId,
          title: shortcut.titleName,
        });
        return;
      }

      if (isPsPlus) {
        const game = findPsPlusGameByProductId(shortcut.productId);
        if (!game) {
          Alert.alert(t('Warning'), t('TitleShortcutExpired'));
          return;
        }
        if (game.name) {
          recordTitlePlayed(normalizeTitle(game.name));
          recordRecentLaunch({provider: 'psplus', game});
        }
        // Same params ps-plus-library's own onSelectGame and
        // launchWithProvider's normal (non-shortcut) PS Plus launch path
        // already use for this screen -- see features/launch-title/model/
        // launchCatalogTitle.ts.
        navigationRef.navigate('PsPlusStream', {
          productId: game.productId,
          name: game.name,
          serviceType: game.streamServiceType === 'psnow' ? 'psnow' : 'pscloud',
          streamIdentifier: game.streamIdentifier,
          platform: game.platform,
          isOwned: game.isOwned,
          entitlementId: game.entitlementId,
          posterUrl: game.imageUrl || '',
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
      if (titleItem.ProductTitle) {
        recordTitlePlayed(normalizeTitle(titleItem.ProductTitle));
        recordRecentLaunch({provider: 'xcloud', titleItem});
      }
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
    if (updateCheckedRef.current) {
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
  }, [t]);

  const paperDarkTheme = {
    ...MD3DarkTheme,
    colors: customDarkTheme.colors,
  };
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
    // react-native-gesture-handler requires this at (or near) the app's true
    // root on Android -- without it, a Gesture.Pan()-based view (e.g.
    // SwipeAimZone, the xCloud swipe-to-aim trackpad) can end up claiming
    // touch delivery for the whole screen while a swipe is in progress,
    // instead of only the touches that land inside its own bounds, so
    // ordinary Pressables elsewhere (other virtual gamepad buttons) stop
    // responding for the duration of the swipe. See
    // https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation
    // ("Though it is not always necessary it is recommended that you complete
    // this step since not doing so can lead to some unexpected behavior").
    <GestureHandlerRootView style={styles.gestureRoot}>
      <Provider store={store}>
        <PaperProvider theme={paperTheme}>
          <NavigationContainer
            ref={navigationRef}
            theme={navigationTheme}
            onReady={() => {
              // The first screen (Main) is on screen: drop the launch splash.
              SplashScreen.hide();
              if (pendingTitleShortcutRef.current) {
                const shortcut = pendingTitleShortcutRef.current;
                pendingTitleShortcutRef.current = null;
                openTitleShortcut(shortcut);
              }
            }}>
            <RootStack.Navigator>
              <RootStack.Group>
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
                  name="InputMapping"
                  component={InputMappingBackgroundScreen}
                  options={{title: t('InputMapping')}}
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
                <RootStack.Screen
                  name="PsPlusLogin"
                  component={PsPlusLoginBackgroundScreen}
                  options={{title: t('PsPlusLogin')}}
                />
                <RootStack.Screen
                  name="PsPlusStream"
                  component={PsPlusStreamScreen}
                  // No push/pop transition animation for this screen: the
                  // stack navigator (react-native-screens, on by default with
                  // @react-navigation/native) snapshots/hardware-layers the
                  // screen during that animation, which is a well-known way
                  // for a SurfaceView's transparent hole-punch to silently
                  // stop compositing -- worth ruling out before spending any
                  // more native-side effort on the black-video bug.
                  options={{headerShown: false, animationEnabled: false}}
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
                <Button
                  onPress={() => setUpdateProgressVisible(false)}
                  onFocus={updateHideFocus.onFocus}
                  onBlur={updateHideFocus.onBlur}
                  style={updateHideFocus.focused && tvFocusRing}>
                  {t('Hide')}
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </PaperProvider>
      </Provider>
      <SystemBars style="light" hidden={false} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backgroundScreen: {
    flex: 1,
  },
  backgroundScreenDark: {
    backgroundColor: PAGE_BACKGROUND_DARK,
  },
  backgroundContent: {
    flex: 1,
  },
  updateProgressText: {
    marginBottom: 12,
  },
});

export default App;
