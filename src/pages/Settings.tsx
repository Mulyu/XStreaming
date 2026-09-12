import React from 'react';
import {
  StyleSheet,
  ScrollView,
  Alert,
  View,
  NativeModules,
  ToastAndroid,
} from 'react-native';
import {Text, SegmentedButtons} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {getSettings, saveSettings, resetSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import {
  SwitchRow,
  SegmentedRow,
  DropdownRow,
  SliderRow,
  SwatchRow,
  InfoRow,
  XBOX_ACCENT,
  NVIDIA_ACCENT,
} from '../components/InlineSettingRows';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {clearStreamToken} from '../store/streamTokenStore';
import {clearWebToken} from '../store/webTokenStore';
import {clearXcloudData} from '../store/xcloudStore';
import {useGfnSignIn} from '../gfn/useGfnSignIn';
import GfnSignInModal from '../components/GfnSignInModal';
import {getValidGfnJwt, getValidGfnUserId} from '../gfn/auth';
import {
  fetchGfnSubscription,
  fetchGfnVpcId,
  fetchGfnRegions,
  GfnSubscriptionInfo,
  GfnRegionOption,
} from '../gfn/session';
import {
  DEFAULT_THEME_PRIMARY_COLOR,
  normalizeHexColor,
} from '../utils/themeColor';

import bases from '../common/settings/bases';
import display from '../common/settings/display';
import gamepad from '../common/settings/gamepad';
import vgamepad from '../common/settings/vgamepad';
import audio from '../common/settings/audio';
import xcloud from '../common/settings/xcloud';
import gfn from '../common/settings/gfn';
import others from '../common/settings/others';

import pkg from '../../package.json';

const {UsbRumbleManager} = NativeModules;

const log = debugFactory('SettingsScreen');

// Every setting, regardless of which file defines it -- looked up by name so
// a row only needs to say which setting it is, not repeat its title/
// description/options inline.
const allMetas = [
  ...bases,
  ...display,
  ...gamepad,
  ...vgamepad,
  ...audio,
  ...xcloud,
  ...gfn,
  ...others,
];

const M = (name: string): any => allMetas.find(m => m.name === name);

type Lane = 'common' | 'xbox' | 'gfn';

function SectionLabel({title}: {title: string}) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function SettingsScreen({navigation}) {
  const {t} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const [loading, setLoading] = React.useState(false);
  const [lane, setLane] = React.useState<Lane>('common');
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

  const handleGamepadKernalChange = (value: string) => {
    applyAndSave({
      gamepad_kernal: value,
      gamepad_maping: null,
      native_gamepad_maping: null,
    });
  };

  const handleBindUsbDeviceChange = (value: boolean) => {
    UsbRumbleManager.setBindUsbDevice(value);
    updateSetting('bind_usb_device', value);
  };

  const handleThemeColorChange = (value: string) => {
    updateSetting(
      'theme_primary_color',
      normalizeHexColor(value, DEFAULT_THEME_PRIMARY_COLOR),
    );
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

  const handleItemPress = async id => {
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
      const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
      const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;
      if (isUsbMode) {
        Alert.alert(
          t(
            'After replacing the Android controller driver, controller button mapping is temporarily not supported',
          ),
        );
        return;
      }
      if (settings.gamepad_kernal === 'Web') {
        navigation.navigate('GameMap');
      } else {
        navigation.navigate('NativeGameMap');
      }
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

  return (
    <View style={styles.container}>
      <Spinner loading={loading} text={t('Loading...')} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('Settings')}</Text>
        <SegmentedButtons
          value={lane}
          onValueChange={value => setLane(value as Lane)}
          buttons={[
            {value: 'common', label: t('CommonSettings')},
            {value: 'xbox', label: t('XcloudSettings')},
            {value: 'gfn', label: t('GfnSettings')},
          ]}
        />
      </View>

      {lane === 'common' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('BasesSettings')} />
          <DropdownRow
            title={M('locale').title}
            desc={M('locale').description}
            options={M('locale').data}
            value={settings.locale}
            onChange={handleLocaleChange}
          />
          <SegmentedRow
            title={M('theme').title}
            desc={M('theme').description}
            options={M('theme').data}
            value={settings.theme}
            onChange={v => updateSetting('theme', v)}
          />
          <SwatchRow
            title={M('theme_primary_color').title}
            desc={M('theme_primary_color').description}
            colors={M('theme_primary_color').data.map((d: any) => d.value)}
            value={normalizeHexColor(
              settings.theme_primary_color,
              DEFAULT_THEME_PRIMARY_COLOR,
            )}
            onChange={handleThemeColorChange}
          />

          <SectionLabel title={t('DisplaySettings')} />
          <SwitchRow
            title={M('fsr').title}
            desc={M('fsr').description}
            value={settings.fsr}
            onChange={v => updateSetting('fsr', v)}
          />
          <DropdownRow
            title={M('video_format').title}
            desc={M('video_format').description}
            options={M('video_format').data}
            value={settings.video_format}
            onChange={v => updateSetting('video_format', v)}
          />
          <SwitchRow
            title={M('show_performance').title}
            desc={M('show_performance').description}
            value={settings.show_performance}
            onChange={v => updateSetting('show_performance', v)}
          />
          <SegmentedRow
            title={M('screen_position').title}
            desc={M('screen_position').description}
            options={M('screen_position').data}
            value={settings.screen_position}
            onChange={v => updateSetting('screen_position', v)}
          />
          <SwitchRow
            title={M('native_low_latency_decoder').title}
            desc={M('native_low_latency_decoder').description}
            value={settings.native_low_latency_decoder}
            onChange={handleLowLatencyDecoderChange}
          />
          <SegmentedRow
            title={M('performance_style').title}
            desc={M('performance_style').description}
            options={M('performance_style').data}
            value={settings.performance_style}
            onChange={v => updateSetting('performance_style', v)}
          />
          <SwitchRow
            title={M('show_menu').title}
            desc={M('show_menu').description}
            value={settings.show_menu}
            onChange={v => updateSetting('show_menu', v)}
          />

          <SectionLabel title={t('GamepadSettings')} />
          <SettingItem
            title={t('Key mapping')}
            description={t('Mapping key of gamepad')}
            onPress={() => handleItemPress('maping')}
          />
          <DropdownRow
            title={M('polling_rate').title}
            desc={M('polling_rate').description}
            options={M('polling_rate').data}
            value={settings.polling_rate}
            onChange={v => updateSetting('polling_rate', v)}
          />
          <SwitchRow
            title={M('vibration').title}
            desc={M('vibration').description}
            value={settings.vibration}
            onChange={v => updateSetting('vibration', v)}
          />
          <SegmentedRow
            title={M('gamepad_kernal').title}
            desc={M('gamepad_kernal').description}
            options={M('gamepad_kernal').data}
            value={settings.gamepad_kernal}
            onChange={handleGamepadKernalChange}
          />
          <SegmentedRow
            title={M('vibration_mode').title}
            desc={M('vibration_mode').description}
            options={M('vibration_mode').data}
            value={settings.vibration_mode}
            onChange={v => updateSetting('vibration_mode', v)}
          />
          <SwitchRow
            title={M('bind_usb_device').title}
            desc={M('bind_usb_device').description}
            value={settings.bind_usb_device}
            onChange={handleBindUsbDeviceChange}
          />
          <SegmentedRow
            title={M('rumble_intensity').title}
            desc={M('rumble_intensity').description}
            options={M('rumble_intensity').data}
            value={settings.rumble_intensity}
            onChange={v => updateSetting('rumble_intensity', v)}
          />
          <SliderRow
            title={M('dead_zone').title}
            desc={M('dead_zone').description}
            min={M('dead_zone').min}
            max={M('dead_zone').max}
            step={M('dead_zone').step}
            value={settings.dead_zone}
            onChange={v => updateSetting('dead_zone', v)}
            formatValue={v => v.toFixed(2)}
          />
          <SliderRow
            title={M('edge_compensation').title}
            desc={M('edge_compensation').description}
            min={M('edge_compensation').min}
            max={M('edge_compensation').max}
            step={M('edge_compensation').step}
            value={settings.edge_compensation}
            onChange={v => updateSetting('edge_compensation', v)}
            formatValue={v => String(v)}
          />
          <SwitchRow
            title={M('short_trigger').title}
            desc={M('short_trigger').description}
            value={settings.short_trigger}
            onChange={v => updateSetting('short_trigger', v)}
          />
          <SwitchRow
            title={M('auto_sprint').title}
            desc={M('auto_sprint').description}
            value={settings.auto_sprint}
            onChange={v => updateSetting('auto_sprint', v)}
          />
          <SettingItem
            title={t('GamepadTestTitle')}
            description={t('GamepadTestDescription')}
            onPress={() => navigation.navigate('GamepadTest')}
          />

          <SectionLabel title={t('vGamepadSettings')} />
          <SwitchRow
            title={M('show_virtual_gamead').title}
            desc={M('show_virtual_gamead').description}
            value={settings.show_virtual_gamead}
            onChange={v => updateSetting('show_virtual_gamead', v)}
          />
          <SliderRow
            title={M('virtual_gamepad_opacity').title}
            desc={M('virtual_gamepad_opacity').description}
            min={M('virtual_gamepad_opacity').min}
            max={M('virtual_gamepad_opacity').max}
            step={M('virtual_gamepad_opacity').step}
            value={settings.virtual_gamepad_opacity}
            onChange={v => updateSetting('virtual_gamepad_opacity', v)}
            formatValue={v => `${Math.round(v * 100)}%`}
          />
          <SegmentedRow
            title={M('virtual_gamepad_joystick').title}
            desc={M('virtual_gamepad_joystick').description}
            options={M('virtual_gamepad_joystick').data}
            value={settings.virtual_gamepad_joystick}
            onChange={v => updateSetting('virtual_gamepad_joystick', v)}
          />
          <SettingItem
            title={t('Customize virtual buttons')}
            description={t('Customize buttons of virtual gamepad')}
            onPress={() => navigation.navigate('VirtualGamepadSettings')}
          />
          <SettingItem
            title={t('Auto toggle hold buttons')}
            description={t('Select what buttons become toggle holdable')}
            onPress={() => navigation.navigate('HoldButtons')}
          />
          <SettingItem
            title={t('Virtual macro settings')}
            description={t('Enable macro button and edit its action sequence')}
            onPress={() => navigation.navigate('VirtualMacroSettings')}
          />

          <SectionLabel title={t('AudioSettings')} />
          <SwitchRow
            title={M('enable_audio_rumble').title}
            desc={M('enable_audio_rumble').description}
            value={settings.enable_audio_rumble}
            onChange={v => updateSetting('enable_audio_rumble', v)}
          />
          <SliderRow
            title={M('audio_rumble_threshold').title}
            desc={M('audio_rumble_threshold').description}
            min={M('audio_rumble_threshold').min}
            max={M('audio_rumble_threshold').max}
            step={M('audio_rumble_threshold').step}
            value={settings.audio_rumble_threshold}
            onChange={v => updateSetting('audio_rumble_threshold', v)}
            formatValue={v => String(v)}
          />
          <SwitchRow
            title={M('enable_microphone').title}
            desc={M('enable_microphone').description}
            value={settings.enable_microphone}
            onChange={v => updateSetting('enable_microphone', v)}
            flag={gfnNoOpFlag}
          />

          <SectionLabel title={t('Others')} />
          <SwitchRow
            title={M('native_touch').title}
            desc={M('native_touch').description}
            value={settings.native_touch}
            onChange={v => updateSetting('native_touch', v)}
            flag={gfnNoOpFlag}
          />
          <SliderRow
            title={M('anti_idle_max_minutes').title}
            desc={M('anti_idle_max_minutes').description}
            min={M('anti_idle_max_minutes').min}
            max={M('anti_idle_max_minutes').max}
            step={M('anti_idle_max_minutes').step}
            value={settings.anti_idle_max_minutes}
            onChange={v => updateSetting('anti_idle_max_minutes', v)}
            formatValue={v => `${v}m`}
          />
          <SwitchRow
            title={M('check_update').title}
            desc={M('check_update').description}
            value={settings.check_update}
            onChange={v => updateSetting('check_update', v)}
          />
          <SettingItem
            title={t('Clear Cache')}
            description={t('Clear XStreaming Cache Data(Keep login data)')}
            onPress={() => handleClearCache()}
          />
          <SettingItem
            title={t('HistoryTitle')}
            description={`${t('HistoryDesc')}`}
            onPress={() => navigation.navigate('History')}
          />

          <View style={styles.version}>
            <Text style={styles.versionText} variant="titleMedium">
              {t('Version')}: v{pkg.version}
            </Text>
            <Text style={styles.versionText} variant="titleSmall">
              © 2024-{new Date().getFullYear()} Geocld
            </Text>
          </View>
        </ScrollView>
      )}

      {lane === 'xbox' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('SectionAccount')} />
          <SettingItem
            title={t('XcloudAccountTitle')}
            description={
              isAuthed
                ? user
                  ? `${t('Current user')}: ${user}`
                  : t('XcloudAccountSignedInDesc')
                : t('XcloudAccountSignedOutDesc')
            }
            onPress={handleXcloudAccountPress}
          />

          <SectionLabel title={t('SectionVideo')} />
          <SegmentedRow
            title={M('resolution').title}
            desc={M('resolution').description}
            options={M('resolution').data}
            value={settings.resolution}
            onChange={v => updateSetting('resolution', v)}
          />
          <SegmentedRow
            title={M('codec').title}
            desc={M('codec').description}
            options={M('codec').data}
            value={settings.codec}
            onChange={v => updateSetting('codec', v)}
          />
          <SwitchRow
            title={M('native_portrait_mode').title}
            desc={M('native_portrait_mode').description}
            value={settings.native_portrait_mode}
            onChange={v => updateSetting('native_portrait_mode', v)}
            accent={XBOX_ACCENT}
          />

          <SectionLabel title={t('SectionRegionSignaling')} />
          <DropdownRow
            title={M('force_region_ip').title}
            desc={M('force_region_ip').description}
            options={M('force_region_ip').data}
            value={settings.force_region_ip}
            onChange={handleForceRegionChange}
          />
          <DropdownRow
            title={M('signaling_cloud').title}
            desc={M('signaling_cloud').description}
            options={signalingCloudOptions}
            value={signalingCloudValue}
            onChange={handleSignalingCloudChange}
            emptyLabel={t('Default')}
          />

          <SectionLabel title={t('SectionSignInLanguage')} />
          <DropdownRow
            title={M('preferred_game_language').title}
            desc={M('preferred_game_language').description}
            options={M('preferred_game_language').data}
            value={settings.preferred_game_language}
            onChange={handlePreferredLanguageChange}
          />
          <SwitchRow
            title={M('use_msal_login').title}
            desc={M('use_msal_login').description}
            value={settings.use_msal_login}
            onChange={handleUseMsalLoginChange}
          />

          <SectionLabel title={t('SectionControllers')} />
          <SettingItem
            title={t('DualSense_adaptive_trigger_left')}
            description={`${t('DualSense_adaptive_trigger_left_desc')}`}
            onPress={() =>
              navigation.navigate({
                name: 'Ds5',
                params: {type: 'left'},
              })
            }
          />
          <SettingItem
            title={t('DualSense_adaptive_trigger_right')}
            description={`${t('DualSense_adaptive_trigger_right_desc')}`}
            onPress={() =>
              navigation.navigate({
                name: 'Ds5',
                params: {type: 'right'},
              })
            }
          />
        </ScrollView>
      )}

      {lane === 'gfn' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('SectionAccount')} />
          <SettingItem
            title={t('GfnAccountTitle')}
            description={
              gfnSignedIn ? t('GfnSignedIn') : t('GfnAccountSignedOutDesc')
            }
            onPress={handleGfnAccountPress}
          />
          <InfoRow
            title={t('GfnPlaytimeTitle')}
            value={gfnPlaytimeDescription()}
            accent={NVIDIA_ACCENT}
          />

          <SectionLabel title={t('SectionVideo')} />
          <SegmentedRow
            title={M('gfn_resolution').title}
            desc={M('gfn_resolution').description}
            options={M('gfn_resolution').data}
            value={settings.gfn_resolution}
            onChange={v => updateSetting('gfn_resolution', v)}
            accent={NVIDIA_ACCENT}
          />
          <SegmentedRow
            title={M('gfn_fps').title}
            desc={M('gfn_fps').description}
            options={M('gfn_fps').data}
            value={settings.gfn_fps}
            onChange={v => updateSetting('gfn_fps', v)}
            accent={NVIDIA_ACCENT}
          />
          <SegmentedRow
            title={M('gfn_bitrate_mode').title}
            desc={M('gfn_bitrate_mode').description}
            options={M('gfn_bitrate_mode').data}
            value={settings.gfn_bitrate_mode}
            onChange={v => updateSetting('gfn_bitrate_mode', v)}
            accent={NVIDIA_ACCENT}
          />
          {settings.gfn_bitrate_mode === 'custom' && (
            <SliderRow
              title={t('Custom')}
              min={4}
              max={50}
              step={1}
              value={settings.gfn_bitrate}
              onChange={v => updateSetting('gfn_bitrate', v)}
              formatValue={v => `${v} Mbps`}
              accent={NVIDIA_ACCENT}
            />
          )}
          <DropdownRow
            title={M('gfn_region').title}
            desc={M('gfn_region').description}
            options={gfnRegionOptions}
            value={settings.gfn_region}
            onChange={v => updateSetting('gfn_region', v)}
            accent={NVIDIA_ACCENT}
            emptyLabel={t('Auto')}
          />
        </ScrollView>
      )}

      <GfnSignInModal
        visible={gfnLoginVisible}
        status={gfnLoginStatus}
        challenge={gfnChallenge}
        onRetry={retryGfnLogin}
        onCancel={cancelGfnLogin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  settingsScroll: {
    flex: 1,
  },
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  title: {fontSize: 18, fontWeight: '800'},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#8A9A92',
    marginTop: 18,
    marginBottom: 2,
    marginHorizontal: 16,
  },
  version: {
    paddingTop: 20,
    paddingBottom: 50,
    textAlign: 'center',
  },
  versionText: {
    textAlign: 'center',
    paddingTop: 10,
  },
});

export default SettingsScreen;
