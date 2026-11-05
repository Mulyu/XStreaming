import React from 'react';
import {Alert, ToastAndroid} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../../../shared/lib/debug';
import {
  clearStreamToken,
  clearWebToken,
  getCachedXboxProfile,
  loadXboxProfile,
  getWebToken,
  isWebTokenValid,
  XboxProfile,
} from '../../../entities/xbox-token';
import {
  clearXcloudData,
  deriveMarketLanguage,
} from '../../../entities/catalog-title';
import {useGfnSignIn} from '../../../features/gfn-auth';
import {
  useXcloudLogin,
  loadStreamingTime,
  getContentAccessAuthorization,
} from '../../../features/xbox-auth';
import type {StreamingTimeResult} from '../../../features/xbox-auth';
import type {TimeLeft} from '../../../entities/xbox-token';
import {
  isPsPlusSignedIn,
  getNpsso,
  clearNpsso,
  clearCatalogGames,
  loadPsPlusOnlineId,
  buildDatacenterOptions,
} from '../../../features/ps-plus-session';
import {
  getGfnDisplayName,
  getValidGfnJwt,
  getValidGfnUserId,
} from '../../../entities/gfn-account';
import {
  fetchGfnSubscription,
  fetchGfnVpcId,
  fetchGfnQueueStatus,
  fetchGfnRegions,
  GfnSubscriptionInfo,
  GfnQueueStatus,
  GfnRegionOption,
} from '../../../features/gfn-session';
import {getSettings, saveSettings} from '../../../shared/lib/settings';
import {getSystemRegion} from '../../../shared/lib/locale';
import {
  basesSettings as bases,
  displaySettings as display,
  gamepadSettings as gamepad,
  xcloudSettings as xcloud,
  gfnSettings as gfn,
  psPlusSettings as psplus,
} from '../../../features/app-settings';

const log = debugFactory('SettingsScreen');

// Every setting, regardless of which file defines it -- looked up by name so
// a row only needs to say which setting it is, not repeat its title/
// description/options inline.
const allMetas = [
  ...bases,
  ...display,
  ...gamepad,
  ...xcloud,
  ...gfn,
  ...psplus,
];

export const M = (name: string): any => allMetas.find(m => m.name === name);

export type Lane = 'common' | 'xbox' | 'gfn' | 'psplus';

export function useSettingsScreen(navigation: any, route: any) {
  const {t} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const {
    xcloudLoginLoading,
    xcloudLoginText,
    msalData,
    startXcloudLogin,
    cancelXcloudLogin,
  } = useXcloudLogin(navigation, route);

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
  // The PSN online ID for the account card; read once per sign-in.
  const [psOnlineId, setPsOnlineId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!psPlusSignedIn) {
      setPsOnlineId(null);
      return undefined;
    }
    let cancelled = false;
    loadPsPlusOnlineId().then(id => {
      if (!cancelled) {
        setPsOnlineId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [psPlusSignedIn]);
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

  const [gfnSubscription, setGfnSubscription] =
    React.useState<GfnSubscriptionInfo | null>(null);
  const [gfnPlaytimeLoading, setGfnPlaytimeLoading] = React.useState(false);
  const [gfnPlaytimeFailed, setGfnPlaytimeFailed] = React.useState(false);
  // Waiting-for-a-server figure for the account's zone; null = no figure.
  const [gfnQueue, setGfnQueue] = React.useState<GfnQueueStatus | null>(null);
  const [gfnQueueLoading, setGfnQueueLoading] = React.useState(false);
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

  // The signed-in account's profile (gamertag, membership tier), from the
  // web token the app already keeps. Best effort: nothing extra is shown when
  // the call fails. Re-run on focus so a fresh sign-in shows up.
  const [xboxProfile, setXboxProfile] = React.useState<XboxProfile | null>(() =>
    getCachedXboxProfile(),
  );
  React.useEffect(() => {
    if (!isAuthed) {
      setXboxProfile(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      const webToken = getWebToken();
      if (!isWebTokenValid(webToken)) {
        return;
      }
      loadXboxProfile(webToken).then(profile => {
        if (!cancelled && profile) {
          setXboxProfile(profile);
        }
      });
    };
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthed, navigation]);

  // The account's remaining cloud gaming time (Xbox started limiting it per
  // month), asked of Xbox's content-access service. Re-run on focus like the
  // profile above; undefined = not asked yet.
  const [xboxStreamingTime, setXboxStreamingTime] = React.useState<
    StreamingTimeResult | undefined
  >();
  React.useEffect(() => {
    if (!isAuthed || !authentication) {
      setXboxStreamingTime(undefined);
      return;
    }
    let cancelled = false;
    const load = () => {
      const {market} = deriveMarketLanguage(
        getSettings().preferred_game_language,
        getSystemRegion(),
      );
      loadStreamingTime(authentication, market).then(result => {
        if (!cancelled) {
          setXboxStreamingTime(result);
        }
      });
    };
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthed, authentication, navigation]);

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
  // (the existing 'logout' handler, unchanged); signed out -> the interactive
  // sign-in, which now lives here rather than on a separate Home screen
  // (xCloud sign-in is optional, like GFN -- nothing gates app launch on it).
  const handleXcloudAccountPress = () => {
    if (isAuthed) {
      handleItemPress('logout');
      return;
    }
    startXcloudLogin();
  };

  // Long-pressing a provider's account row copies the token that provider's
  // requests are signed with, for inspecting its API off-device. It only goes
  // to the clipboard, never anywhere else.
  const copyToken = (value: string | undefined | null) => {
    if (!value) {
      ToastAndroid.show(t('TokenCopyFailed'), ToastAndroid.SHORT);
      return;
    }
    Clipboard.setString(value);
    ToastAndroid.show(t('Success'), ToastAndroid.SHORT);
  };

  // xCloud: the gsToken and the region it is used against.
  const handleCopyXboxToken = () => {
    const token = streamingTokens.xCloudToken;
    copyToken(
      token?.data?.gsToken
        ? JSON.stringify({
            gsToken: token.data.gsToken,
            baseUri: token.getDefaultRegion?.()?.baseUri,
          })
        : undefined,
    );
  };

  // Holding the cloud gaming time row copies the Authorization header the
  // content-access service is called with, to look at its answer off-device.
  const handleCopyContentAccessAuth = () => {
    getContentAccessAuthorization(authentication)
      .then(copyToken)
      .catch(() => copyToken(undefined));
  };

  // GeForce NOW: the GFNJWT bearer token and the user id.
  const handleCopyGfnToken = () => {
    getValidGfnJwt()
      .then(async token => {
        const userId = token ? await getValidGfnUserId() : undefined;
        copyToken(token ? JSON.stringify({gfnJwt: token, userId}) : undefined);
      })
      .catch(() => copyToken(undefined));
  };

  // PlayStation: the npsso cookie.
  const handleCopyPsPlusToken = () => {
    copyToken(getNpsso());
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
      setGfnQueue(null);
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
      // The queue figure is a separate, best-effort source: it loads in
      // parallel and never affects the playtime row.
      setGfnQueueLoading(true);
      (vpcId ? fetchGfnQueueStatus(vpcId) : Promise.resolve(null))
        .then(setGfnQueue)
        .finally(() => setGfnQueueLoading(false));
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

  const xboxPlaytimeDescription = (): string => {
    if (!xboxStreamingTime) {
      return t('XboxPlaytimeLoading');
    }
    if (!xboxStreamingTime.ok) {
      return xboxStreamingTime.reason
        ? `${t('XboxPlaytimeUnavailable')} (${xboxStreamingTime.reason})`
        : t('XboxPlaytimeUnavailable');
    }
    const summary = xboxStreamingTime.summary;
    if (!summary) {
      return t('XboxPlaytimeNone');
    }
    const left = (time: TimeLeft, key: string, unlimitedKey: string) => {
      if (time.unlimited) {
        return t(unlimitedKey);
      }
      const totalMinutes = Math.floor(time.seconds / 60);
      return t(key, {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
      });
    };
    // Ad-free time, when there is any (or no limit on it); with ads, when the
    // account has that kind. An account with neither shows 0.
    const parts: string[] = [];
    if (summary.adFree.unlimited || summary.adFree.seconds > 0) {
      parts.push(
        left(
          summary.adFree,
          'XboxPlaytimeAdFree',
          'XboxPlaytimeAdFreeUnlimited',
        ),
      );
    }
    if (summary.adSupported) {
      parts.push(
        left(
          summary.adSupported,
          'XboxPlaytimeAdSupported',
          'XboxPlaytimeAdSupportedUnlimited',
        ),
      );
    }
    return parts.length > 0
      ? parts.join(' · ')
      : t('XboxPlaytimeAdFree', {hours: 0, minutes: 0});
  };

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

  const gfnQueueDescription = (): string => {
    if (gfnQueue) {
      return t('GfnQueueValue', {
        waiting: gfnQueue.waiting,
        minutes: gfnQueue.etaMinutes,
      });
    }
    return gfnQueueLoading ? t('GfnQueueLoading') : t('GfnQueueUnavailable');
  };

  // PS Plus: the datacenters seen on earlier connection attempts, with the
  // response time measured for each.
  const psDatacenterOptions = buildDatacenterOptions(
    settings.psplus_datacenter_pings,
    settings.psplus_datacenter,
    t('Auto'),
  );

  const gfnRegionOptions = [
    {value: '', text: t('Auto')},
    ...gfnRegions.map(r => ({value: r.url, text: r.name})),
  ];

  // What each provider's account row shows. Only what the provider lets us
  // read: GeForce NOW gives the plan tier; Xbox only whether a membership is
  // active; PlayStation nothing beyond the signed-in name.
  const xboxAccount = {
    userName: xboxProfile?.gamertag || user,
    planTitle:
      xboxProfile?.accountTier === 'Gold' ? t('XboxGamePassActive') : undefined,
  };

  const gfnAccount = {
    userName: getGfnDisplayName() ?? undefined,
    planTitle: gfnSubscription
      ? gfnSubscription.membershipTier.charAt(0).toUpperCase() +
        gfnSubscription.membershipTier.slice(1).toLowerCase()
      : undefined,
  };

  const psAccount = {
    userName: psOnlineId ?? undefined,
  };

  return {
    t,
    loading,
    xcloudLoginLoading,
    xcloudLoginText,
    msalData,
    onCancelXcloudLogin: cancelXcloudLogin,
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
    gfnRegionOptions,
    psDatacenterOptions,
    xboxAccount,
    xboxPlaytimeDescription: xboxPlaytimeDescription(),
    gfnAccount,
    psAccount,
    gfnPlaytimeDescription: gfnPlaytimeDescription(),
    gfnQueueDescription: gfnQueueDescription(),
    onChangeLane: setLane,
    updateSetting,
    onLocaleChange: handleLocaleChange,
    onForceRegionChange: handleForceRegionChange,
    onPreferredLanguageChange: handlePreferredLanguageChange,
    onLowLatencyDecoderChange: handleLowLatencyDecoderChange,
    onSignalingCloudChange: handleSignalingCloudChange,
    onGfnAccountPress: handleGfnAccountPress,
    onCopyXboxToken: handleCopyXboxToken,
    onCopyContentAccessAuth: handleCopyContentAccessAuth,
    onCopyGfnToken: handleCopyGfnToken,
    onCopyPsPlusToken: handleCopyPsPlusToken,
    onPsPlusAccountPress: handlePsPlusAccountPress,
    onXcloudAccountPress: handleXcloudAccountPress,
    onNavigateInputMapping: () => navigation.navigate('InputMapping'),
  };
}

export type SettingsScreenViewModel = ReturnType<typeof useSettingsScreen>;
