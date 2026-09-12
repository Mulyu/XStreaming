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
import {getSettings, resetSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import SettingSection from '../components/SettingSection';
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
  GfnSubscriptionInfo,
} from '../gfn/session';

import bases from '../common/settings/bases';
import display from '../common/settings/display';
import gamepad from '../common/settings/gamepad';
import vgamepad from '../common/settings/vgamepad';
import audio from '../common/settings/audio';
import xcloud from '../common/settings/xcloud';
import gfn from '../common/settings/gfn';
import sensor from '../common/settings/sensor';
import others from '../common/settings/others';

import pkg from '../../package.json';

const {UsbRumbleManager} = NativeModules;

const log = debugFactory('SettingsScreen');

// Every setting, regardless of which file defines it, so a setting can be
// picked into the lane/section it actually belongs to (see pick() below)
// without having to physically move it between the common/settings/*.ts
// files those definitions also feed (SettingDetail.tsx merges the same
// files the same way to resolve a tapped setting by name).
const allMetas = [
  ...bases,
  ...display,
  ...gamepad,
  ...vgamepad,
  ...audio,
  ...xcloud,
  ...gfn,
  ...sensor,
  ...others,
];

const pick = (names: string[]) =>
  names.map(n => allMetas.find(m => m.name === n)).filter(Boolean) as any[];

type Lane = 'common' | 'xbox' | 'gfn';

function SettingsScreen({navigation}) {
  const {t} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);

  const [loading, setLoading] = React.useState(false);
  const [lane, setLane] = React.useState<Lane>('common');

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

  React.useEffect(() => {
    log.info('settings page show');
  }, [navigation]);

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
      const settings = getSettings();
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
    } else {
      navigation.navigate('SettingDetail', {
        id,
      });
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

  const renderMetaRows = (metas: any[], flags: Record<string, string> = {}) =>
    metas.map((meta, idx) => (
      <SettingItem
        key={meta.name || idx}
        title={meta.title}
        description={
          flags[meta.name]
            ? `${meta.description}\n${flags[meta.name]}`
            : meta.description
        }
        onPress={() => handleItemPress(meta.name)}
      />
    ));

  // ---- Common lane: local/device settings that behave the same for either
  // provider, split by the same categories the settings used to be flatly
  // listed under. `coop` moves out to the Xbox lane below (GfnStreamAdapter's
  // setCoop() is a no-op), and xcloud.ts's anti_idle_max_minutes moves in
  // (its background keep-alive has no streamType check -- it already runs
  // the same for a GFN session, so it belongs here, not under Xbox).
  const commonBasic = pick(['locale', 'theme', 'theme_primary_color']);
  const commonDisplay = pick([
    'fsr',
    'video_format',
    'show_performance',
    'screen_position',
    'native_low_latency_decoder',
    'performance_style',
    'show_menu',
  ]);
  const commonGamepad = pick([
    'maping',
    'polling_rate',
    'vibration',
    'gamepad_kernal',
    'vibration_mode',
    'bind_usb_device',
    'rumble_intensity',
    'dead_zone',
    'edge_compensation',
    'short_trigger',
    'auto_sprint',
  ]);
  const commonVirtual = pick([
    'show_virtual_gamead',
    'virtual_gamepad_opacity',
    'virtual_gamepad_joystick',
  ]);
  const commonAudio = pick([
    'enable_stereo_audio',
    'enable_audio_control',
    'enable_audio_rumble',
    'audio_rumble_threshold',
    'enable_microphone',
  ]);
  const commonSensor = pick([
    'sensor',
    'sensor_type',
    'sensor_sensitivity_x',
    'sensor_sensitivity_y',
    'sensor_invert',
  ]);
  const commonOthers = pick([
    'native_touch',
    'anti_idle_max_minutes',
    'check_update',
  ]);

  // ---- Xbox Cloud Gaming lane
  const xboxVideo = pick([
    'resolution',
    'codec',
    'xcloud_bitrate_mode',
    'audio_bitrate_mode',
    'native_portrait_mode',
  ]);
  const xboxRegion = pick(['force_region_ip', 'signaling_cloud']);
  const xboxSignIn = pick(['preferred_game_language', 'use_msal_login']);
  const xboxCoop = pick(['coop']);

  // ---- GeForce NOW lane
  const gfnVideo = pick([
    'gfn_resolution',
    'gfn_fps',
    'gfn_bitrate_mode',
    'gfn_region',
  ]);

  const gfnNoOpFlag = t('FlagGfnNoOp');
  const bitrateNotWiredFlag = t('FlagBitrateNotWired');

  return (
    <View style={styles.container}>
      <Spinner loading={loading} text={t('Loading...')} />

      <View style={styles.laneTabs}>
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
          <SettingSection
            emoji="⚙️"
            title={t('BasesSettings')}
            count={commonBasic.length}
            defaultOpen>
            {renderMetaRows(commonBasic)}
          </SettingSection>

          <SettingSection
            emoji="🖥️"
            title={t('DisplaySettings')}
            count={commonDisplay.length}>
            {renderMetaRows(commonDisplay)}
          </SettingSection>

          <SettingSection
            emoji="🎮"
            title={t('GamepadSettings')}
            count={commonGamepad.length + 1}>
            {renderMetaRows(commonGamepad, {vibration: gfnNoOpFlag})}
            <SettingItem
              title={t('GamepadTestTitle')}
              description={t('GamepadTestDescription')}
              onPress={() => navigation.navigate('GamepadTest')}
            />
          </SettingSection>

          <SettingSection
            emoji="🧩"
            title={t('vGamepadSettings')}
            count={commonVirtual.length + 3}>
            {renderMetaRows(commonVirtual)}
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
              description={t(
                'Enable macro button and edit its action sequence',
              )}
              onPress={() => navigation.navigate('VirtualMacroSettings')}
            />
          </SettingSection>

          <SettingSection
            emoji="🔊"
            title={t('AudioSettings')}
            count={commonAudio.length}>
            {renderMetaRows(commonAudio, {enable_microphone: gfnNoOpFlag})}
          </SettingSection>

          <SettingSection
            emoji="🌀"
            title={t('SensorSettings')}
            count={commonSensor.length}>
            {renderMetaRows(commonSensor)}
          </SettingSection>

          <SettingSection
            emoji="🗂️"
            title={t('Others')}
            count={commonOthers.length + 2}>
            {renderMetaRows(commonOthers, {native_touch: gfnNoOpFlag})}
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
          </SettingSection>

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
          <SettingSection
            emoji="👤"
            title={t('SectionAccount')}
            count={1}
            defaultOpen>
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
          </SettingSection>

          <SettingSection
            emoji="📺"
            title={t('SectionVideo')}
            count={xboxVideo.length}
            defaultOpen>
            {renderMetaRows(xboxVideo, {
              xcloud_bitrate_mode: bitrateNotWiredFlag,
              audio_bitrate_mode: bitrateNotWiredFlag,
            })}
          </SettingSection>

          <SettingSection
            emoji="📡"
            title={t('SectionRegionSignaling')}
            count={xboxRegion.length}
            defaultOpen>
            {renderMetaRows(xboxRegion)}
          </SettingSection>

          <SettingSection
            emoji="🔑"
            title={t('SectionSignInLanguage')}
            count={xboxSignIn.length}
            defaultOpen>
            {renderMetaRows(xboxSignIn)}
          </SettingSection>

          <SettingSection
            emoji="🕹️"
            title={t('SectionCoopControllers')}
            count={xboxCoop.length + 2}
            defaultOpen>
            {renderMetaRows(xboxCoop)}
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
          </SettingSection>
        </ScrollView>
      )}

      {lane === 'gfn' && (
        <ScrollView style={styles.settingsScroll}>
          <SettingSection
            emoji="👤"
            title={t('SectionAccount')}
            count={2}
            defaultOpen>
            <SettingItem
              title={t('GfnAccountTitle')}
              description={
                gfnSignedIn ? t('GfnSignedIn') : t('GfnAccountSignedOutDesc')
              }
              onPress={handleGfnAccountPress}
            />
            <SettingItem
              title={t('GfnPlaytimeTitle')}
              description={gfnPlaytimeDescription()}
              onPress={loadGfnPlaytime}
            />
          </SettingSection>

          <SettingSection
            emoji="📺"
            title={t('SectionVideo')}
            count={gfnVideo.length}
            defaultOpen>
            {renderMetaRows(gfnVideo)}
          </SettingSection>
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
  laneTabs: {
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
