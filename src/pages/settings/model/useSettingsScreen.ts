import React from 'react';
import {Alert, ToastAndroid} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../../../shared/lib/debug';
import {clearStreamToken, clearWebToken} from '../../../entities/xbox-token';
import {
  clearXcloudData,
  getXcloudData,
  saveXcloudData,
  loadXcloudCatalog,
  getXcloudCatalogStatus,
  clearXcloudCatalogStatus,
  XcloudCatalogStatus,
  fetchGfnFullCatalog,
  clearGfnFullCatalog,
  getGfnFullCatalogStatus,
  GfnFullCatalogStatus,
} from '../../../entities/catalog-title';
import {useGfnSignIn} from '../../../features/gfn-auth';
import {
  isPsPlusSignedIn,
  clearNpsso,
  clearCatalogGames,
} from '../../../features/ps-plus-session';
import {getValidGfnJwt, getValidGfnUserId} from '../../../entities/gfn-account';
import {
  fetchGfnSubscription,
  fetchGfnVpcId,
  fetchGfnRegions,
  GfnSubscriptionInfo,
  GfnRegionOption,
} from '../../../features/gfn-session';
import {
  getSettings,
  saveSettings,
  resetSettings,
} from '../../../shared/lib/settings';
import {
  basesSettings as bases,
  displaySettings as display,
  gamepadSettings as gamepad,
  audioSettings as audio,
  xcloudSettings as xcloud,
  gfnSettings as gfn,
  psPlusSettings as psplus,
  othersSettings as others,
} from '../../../features/app-settings';

const log = debugFactory('SettingsScreen');

// Every setting, regardless of which file defines it -- looked up by name so
// a row only needs to say which setting it is, not repeat its title/
// description/options inline.
const allMetas = [
  ...bases,
  ...display,
  ...gamepad,
  ...audio,
  ...xcloud,
  ...gfn,
  ...psplus,
  ...others,
];

export const M = (name: string): any => allMetas.find(m => m.name === name);

export type Lane = 'common' | 'xbox' | 'gfn' | 'psplus';

export function useSettingsScreen(navigation: any) {
  const {t} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const [loading, setLoading] = React.useState(false);
  const [lane, setLane] = React.useState<Lane>('common');
  // Unlike GFN's own device-code flow, PS Plus sign-in/out never happens
  // while this screen stays mounted (it's a WebView screen navigated away
  // to), so this only needs to resync when this screen regains focus.
  const [psPlusSignedIn, setPsPlusSignedIn] = React.useState(
    isPsPlusSignedIn(),
  );
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setPsPlusSignedIn(isPsPlusSignedIn());
    });
    return unsubscribe;
  }, [navigation]);
  const [settings, setSettings] = React.useState(() => getSettings());

  const {
    signedIn: gfnSignedIn,
    loginVisible: gfnLoginVisible,
    challenge: gfnChallenge,
    loginStatus: gfnLoginStatus,
    startLogin: startGfnLogin,
    retryLogin: retryGfnLogin,
    cancelLogin: cancelGfnLogin,
    signOut: signOutGfn,
  } = useGfnSignIn();

  // Catalog cache status for each service's "clear + reload" row below --
  // read from storage on mount so it reflects whatever the last load (by
  // this screen or Library/Store) actually found, without needing a fetch
  // just to display it.
  const [xcloudCatalogStatus, setXcloudCatalogStatus] =
    React.useState<XcloudCatalogStatus | null>(() => getXcloudCatalogStatus());
  const [xcloudCatalogLoading, setXcloudCatalogLoading] = React.useState(false);
  const [gfnCatalogStatus, setGfnCatalogStatus] =
    React.useState<GfnFullCatalogStatus | null>(() =>
      getGfnFullCatalogStatus(),
    );
  const [gfnCatalogLoading, setGfnCatalogLoading] = React.useState(false);

  const [gfnSubscription, setGfnSubscription] =
    React.useState<GfnSubscriptionInfo | null>(null);
  const [gfnPlaytimeLoading, setGfnPlaytimeLoading] = React.useState(false);
  const [gfnPlaytimeFailed, setGfnPlaytimeFailed] = React.useState(false);
  const [gfnRegions, setGfnRegions] = React.useState<GfnRegionOption[]>([]);

  const sisuToken = authentication._tokenStore.getSisuToken();
  const userToken = authentication._tokenStore.getUserToken();

  let isAuthed = false;
  let user = '';

  if (sisuToken && sisuToken.data && sisuToken.data.AuthorizationToken) {
    isAuthed = true;

    if (sisuToken.data.AuthorizationToken.DisplayClaims) {
      try {
        user = sisuToken.data.AuthorizationToken.DisplayClaims.xui[0].mgt;
      } catch (e) {}
    }
  }

  if (userToken && userToken.data && userToken.data.access_token) {
    isAuthed = true;
  }

  // xCloud's signaling-region list lives on the token, not in storage, so it
  // has to be re-read every render rather than loaded into state once.
  const xgpuRegions = React.useRef<any[]>([]);
  if (streamingTokens.xCloudToken) {
    xgpuRegions.current = streamingTokens.xCloudToken?.getRegions() || [];
  }

  React.useEffect(() => {
    log.info('settings page show');
  }, [navigation]);

  // Settings can also change from other screens (key mapping, DualSense
  // trigger tuning, ...); reload from storage whenever this tab regains
  // focus so an inline control never shows a stale value.
  React.useEffect(() => {
    const reload = () => setSettings(getSettings());
    const unsubscribe = navigation.addListener('focus', reload);
    return unsubscribe;
  }, [navigation]);

  // Library.tsx/Store.tsx can load either catalog in the background while
  // this tab isn't focused -- refresh the status shown here so it doesn't
  // keep reading "not loaded" after that happens elsewhere.
  React.useEffect(() => {
    const reload = () => {
      setXcloudCatalogStatus(getXcloudCatalogStatus());
      setGfnCatalogStatus(getGfnFullCatalogStatus());
    };
    const unsubscribe = navigation.addListener('focus', reload);
    return unsubscribe;
  }, [navigation]);

  const restart = () => setTimeout(() => RNRestart.restart(), 500);
  const restartDelayed = () => setTimeout(restart, 500);

  const applyAndSave = (patch: Record<string, any>) => {
    setSettings(prev => {
      const next = {...prev, ...patch};
      saveSettings(next);
      return next;
    });
  };

  const updateSetting = (name: string, value: any) =>
    applyAndSave({[name]: value});

  const handleLocaleChange = (value: string) => {
    applyAndSave({locale: value, locale_follow_system: false});
    restart();
  };

  const handleForceRegionChange = (value: string) => {
    clearStreamToken();
    clearWebToken();
    clearXcloudData();
    applyAndSave({force_region_ip: value});
    restartDelayed();
  };

  const handleUseMsalLoginChange = (value: boolean) => {
    clearStreamToken();
    clearWebToken();
    clearXcloudData();
    authentication._tokenStore.clear();
    CookieManager.clearAll();
    applyAndSave({use_msal_login: value});
    restartDelayed();
  };

  const handlePreferredLanguageChange = (value: string) => {
    clearXcloudData();
    updateSetting('preferred_game_language', value);
  };

  const handleLowLatencyDecoderChange = (value: boolean) => {
    updateSetting('native_low_latency_decoder', value);
    restartDelayed();
  };

  // signaling_cloud is stored as {name, isDefault}[] pairs on the xCloud
  // token itself (see xgpuRegions above) rather than a plain value list, so
  // its current value and its write-back both need this small resolution
  // step instead of the generic updateSetting().
  const signalingCloudOptions = xgpuRegions.current.map((r: any) => ({
    value: r.name,
    text: r.name,
  }));
  let signalingCloudValue = settings.signaling_cloud_name;
  if (!xgpuRegions.current.some((r: any) => r.name === signalingCloudValue)) {
    const def = xgpuRegions.current.find((r: any) => r.isDefault);
    signalingCloudValue = def ? def.name : '';
  }
  const handleSignalingCloudChange = (value: string) => {
    xgpuRegions.current.forEach((r: any) => {
      r.isDefault = r.name === value;
    });
    updateSetting('signaling_cloud_name', value);
  };

  const handleItemPress = id => {
    if (id === 'logout') {
      Alert.alert(t('Warning'), t('Do you want to logout?'), [
        {
          text: t('Cancel'),
          style: 'cancel',
        },
        {
          text: t('Confirm'),
          style: 'default',
          onPress: () => {
            setLoading(true);
            clearStreamToken();
            clearWebToken();
            clearXcloudData();
            authentication._tokenStore.clear();
            CookieManager.clearAll();
            setTimeout(() => {
              RNRestart.restart();
            }, 1000);
          },
        },
      ]);
    } else if (id === 'maping') {
      navigation.navigate('NativeGameMap');
    }
  };

  const handleGfnAccountPress = () => {
    if (gfnSignedIn) {
      Alert.alert(t('Warning'), t('GfnSignOutConfirm'), [
        {text: t('Cancel'), style: 'cancel'},
        {text: t('Confirm'), style: 'default', onPress: signOutGfn},
      ]);
      return;
    }
    startGfnLogin();
  };

  // Mirrors handleGfnAccountPress: signed in -> confirm-then-sign-out
  // (npsso is just cleared locally, no server-side call needed); signed
  // out -> the WebView login screen.
  const handlePsPlusAccountPress = () => {
    if (psPlusSignedIn) {
      Alert.alert(t('Warning'), t('PsPlusSignOutConfirm'), [
        {text: t('Cancel'), style: 'cancel'},
        {
          text: t('Confirm'),
          style: 'default',
          onPress: () => {
            clearNpsso();
            clearCatalogGames();
            setPsPlusSignedIn(false);
          },
        },
      ]);
      return;
    }
    navigation.navigate('PsPlusLogin');
  };

  // Mirrors the GFN account row above: signed in -> confirm-then-logout
  // (the existing 'logout' handler, unchanged); signed out -> Home with
  // {intent: 'login'}, which is what tells Home.tsx to actually show the
  // interactive login UI instead of its normal silent, non-blocking check
  // (xCloud sign-in is optional now, like GFN -- Home no longer gates app
  // launch on it).
  const handleXcloudAccountPress = () => {
    if (isAuthed) {
      handleItemPress('logout');
      return;
    }
    navigation.navigate('Home', {intent: 'login'});
  };

  // Clears the cached xCloud catalog and immediately re-fetches it, so a
  // truncated or stale entitled-titles list (Library.tsx/Store.tsx load this
  // in the background on their own, with no way to tell the user something
  // went wrong) can be retried on demand. The status this shows is also
  // updated by those background loads, not just this button.
  const handleXcloudCatalogReload = () => {
    if (!streamingTokens?.xCloudToken || xcloudCatalogLoading) {
      return;
    }
    clearXcloudData();
    clearXcloudCatalogStatus();
    setXcloudCatalogStatus(null);
    setXcloudCatalogLoading(true);
    loadXcloudCatalog(streamingTokens.xCloudToken)
      .then(({titles, status}) => {
        if (titles.length > 0) {
          saveXcloudData({...getXcloudData(), titles});
        }
        setXcloudCatalogStatus(status);
      })
      .finally(() => setXcloudCatalogLoading(false));
  };

  const xcloudCatalogDescription = (): string => {
    if (!streamingTokens?.xCloudToken) {
      return t('CatalogStatusSignInFirst');
    }
    if (xcloudCatalogLoading) {
      return t('CatalogStatusLoading');
    }
    if (!xcloudCatalogStatus) {
      return t('CatalogStatusNotLoaded');
    }
    if (xcloudCatalogStatus.state === 'failed') {
      return t('CatalogStatusFailed');
    }
    if (xcloudCatalogStatus.state === 'empty') {
      return t('CatalogStatusEmpty');
    }
    return t('CatalogStatusComplete', {
      count: xcloudCatalogStatus.hydratedCount,
    });
  };

  // Same idea for GFN's full browse catalog -- unlike xCloud's one-shot
  // fetch, this one is a many-page crawl that can now report a genuine
  // "complete" vs "partial" outcome (see fetchGfnFullCatalog in entities/catalog-title/api/gfnCatalog.ts).
  const handleGfnCatalogReload = () => {
    if (!gfnSignedIn || gfnCatalogLoading) {
      return;
    }
    clearGfnFullCatalog();
    setGfnCatalogStatus(null);
    setGfnCatalogLoading(true);
    getValidGfnJwt()
      .then(token => {
        if (!token) {
          return;
        }
        return fetchGfnFullCatalog(token).then(() => {
          setGfnCatalogStatus(getGfnFullCatalogStatus());
        });
      })
      .finally(() => setGfnCatalogLoading(false));
  };

  // Debug aid for the still-unresolved GFN catalog ownership issue: copies the
  // live GFNJWT bearer token (the same one gfnCatalog.ts sends as
  // `Authorization: GFNJWT <token>` on its GraphQL library/browse queries) so
  // the actual raw API response -- specifically each variant's gfn.library.status
  // -- can be inspected directly against a real account, off-device. Only ever
  // copies locally to the clipboard, never sent anywhere on its own.
  const handleCopyGfnDebugInfo = () => {
    getValidGfnJwt()
      .then(async token => {
        if (!token) {
          ToastAndroid.show(t('GfnDebugCopyFailed'), ToastAndroid.SHORT);
          return;
        }
        const userId = await getValidGfnUserId();
        Clipboard.setString(JSON.stringify({gfnJwt: token, userId}));
        ToastAndroid.show(t('Success'), ToastAndroid.SHORT);
      })
      .catch(() => {
        ToastAndroid.show(t('GfnDebugCopyFailed'), ToastAndroid.SHORT);
      });
  };

  const gfnCatalogDescription = (): string => {
    if (!gfnSignedIn) {
      return t('CatalogStatusSignInFirst');
    }
    if (gfnCatalogLoading) {
      return t('CatalogStatusLoading');
    }
    if (!gfnCatalogStatus) {
      return t('CatalogStatusNotLoaded');
    }
    if (gfnCatalogStatus.count === 0) {
      return gfnCatalogStatus.complete
        ? t('CatalogStatusEmpty')
        : t('CatalogStatusFailed');
    }
    return gfnCatalogStatus.complete
      ? t('CatalogStatusComplete', {count: gfnCatalogStatus.count})
      : t('CatalogStatusPartial', {count: gfnCatalogStatus.count});
  };

  // Fetches the MES (subscription/quota) API for the signed-in GFN account --
  // mainly useful on the free tier's monthly hour cap. Re-runs whenever the
  // Settings tab regains focus (tab screens stay mounted, so a plain mount
  // effect would only ever run once) so the figure doesn't go stale while the
  // user is off streaming.
  const loadGfnPlaytime = React.useCallback(async () => {
    if (!gfnSignedIn) {
      setGfnSubscription(null);
      setGfnPlaytimeFailed(false);
      return;
    }
    setGfnPlaytimeLoading(true);
    setGfnPlaytimeFailed(false);
    try {
      const token = await getValidGfnJwt();
      const userId = token ? await getValidGfnUserId() : null;
      if (!token || !userId) {
        setGfnPlaytimeFailed(true);
        return;
      }
      const vpcId = (await fetchGfnVpcId(token)) ?? undefined;
      const info = await fetchGfnSubscription(token, userId, vpcId);
      if (info) {
        setGfnSubscription(info);
      } else {
        setGfnPlaytimeFailed(true);
      }
    } catch {
      setGfnPlaytimeFailed(true);
    } finally {
      setGfnPlaytimeLoading(false);
    }
  }, [gfnSignedIn]);

  React.useEffect(() => {
    loadGfnPlaytime();
    const unsubscribe = navigation.addListener('focus', loadGfnPlaytime);
    return unsubscribe;
  }, [navigation, loadGfnPlaytime]);

  React.useEffect(() => {
    if (!gfnSignedIn) {
      setGfnRegions([]);
      return;
    }
    let cancelled = false;
    getValidGfnJwt().then(token => {
      if (!token || cancelled) {
        return;
      }
      fetchGfnRegions(token).then(regions => {
        if (!cancelled) {
          setGfnRegions(regions);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gfnSignedIn]);

  const gfnPlaytimeDescription = (): string => {
    if (!gfnSignedIn) {
      return t('GfnPlaytimeSignedOutDesc');
    }
    if (gfnPlaytimeLoading && !gfnSubscription) {
      return t('GfnPlaytimeLoading');
    }
    if (gfnSubscription) {
      if (gfnSubscription.isUnlimited) {
        return t('GfnPlaytimeUnlimited');
      }
      const totalMinutes = Math.max(
        0,
        Math.round(gfnSubscription.remainingHours * 60),
      );
      return t('GfnPlaytimeRemaining', {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
      });
    }
    if (gfnPlaytimeFailed) {
      return t('GfnPlaytimeUnavailable');
    }
    return t('GfnPlaytimeLoading');
  };

  const handleClearCache = () => {
    clearXcloudData();
    resetSettings();
    ToastAndroid.show(t('Success'), ToastAndroid.SHORT);
    setTimeout(() => {
      RNRestart.restart();
    }, 1000);
  };

  const gfnNoOpFlag = t('FlagGfnNoOp');
  const gfnRegionOptions = [
    {value: '', text: t('Auto')},
    ...gfnRegions.map(r => ({value: r.url, text: r.name})),
  ];

  return {
    t,
    loading,
    lane,
    settings,
    gfnSignedIn,
    psPlusSignedIn,
    gfnLoginVisible,
    gfnChallenge,
    gfnLoginStatus,
    retryGfnLogin,
    cancelGfnLogin,
    isAuthed,
    user,
    signalingCloudOptions,
    signalingCloudValue,
    gfnNoOpFlag,
    gfnRegionOptions,
    xcloudCatalogDescription: xcloudCatalogDescription(),
    gfnCatalogDescription: gfnCatalogDescription(),
    gfnPlaytimeDescription: gfnPlaytimeDescription(),
    onChangeLane: setLane,
    updateSetting,
    onLocaleChange: handleLocaleChange,
    onForceRegionChange: handleForceRegionChange,
    onUseMsalLoginChange: handleUseMsalLoginChange,
    onPreferredLanguageChange: handlePreferredLanguageChange,
    onLowLatencyDecoderChange: handleLowLatencyDecoderChange,
    onSignalingCloudChange: handleSignalingCloudChange,
    onItemPress: handleItemPress,
    onGfnAccountPress: handleGfnAccountPress,
    onCopyGfnDebugInfo: handleCopyGfnDebugInfo,
    onPsPlusAccountPress: handlePsPlusAccountPress,
    onXcloudAccountPress: handleXcloudAccountPress,
    onXcloudCatalogReload: handleXcloudCatalogReload,
    onGfnCatalogReload: handleGfnCatalogReload,
    onClearCache: handleClearCache,
    onNavigateVirtualGamepadSettings: () =>
      navigation.navigate('VirtualGamepadSettings'),
    onNavigateHistory: () => navigation.navigate('History'),
    onNavigateDs5Left: () =>
      navigation.navigate({name: 'Ds5', params: {type: 'left'}}),
    onNavigateDs5Right: () =>
      navigation.navigate({name: 'Ds5', params: {type: 'right'}}),
  };
}

export type SettingsScreenViewModel = ReturnType<typeof useSettingsScreen>;
