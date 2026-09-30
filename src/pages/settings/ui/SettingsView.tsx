import React from 'react';
import {StyleSheet, ScrollView, View} from 'react-native';
import {Text, SegmentedButtons} from 'react-native-paper';
import Spinner from '../../../shared/ui/Spinner';
import SettingItem from '../../../shared/ui/SettingItem';
import {
  SwitchRow,
  SegmentedRow,
  DropdownRow,
  TextInputRow,
  SliderRow,
  InfoRow,
  XBOX_ACCENT,
  NVIDIA_ACCENT,
  PS_ACCENT,
} from '../../../shared/ui/InlineSettingRows';
import {GfnSignInModal} from '../../../entities/gfn-account';
import {M} from '../model/useSettingsScreen';
import type {Lane, SettingsScreenViewModel} from '../model/useSettingsScreen';

import pkg from '../../../../package.json';

type Props = SettingsScreenViewModel;

// Tokyo-region guesses for the manual datacenter override below, since the
// account's own /datacenters response has never offered anything outside
// the US (see psPlusDatacenterOptions -- it's a picker over the actually-
// measured pool, not a directory). "tyoa" is the one entry here with real
// evidence behind it: it's a literal hostname (vpn.tyoa.prod.gaikai.com,
// alongside titan's iad/lax/lon/tyo-prod1 city codes) found while surveying
// gaikai.com's Cert Transparency history -- not proven to be a live,
// client-reachable *datacenter* code (that vpn.* host is a much older,
// separate subdomain tree), just the strongest lead found. The rest follow
// the observed live pattern (3-letter airport code + a/b, e.g. laxb/sjcb/
// seaa/dfwb/ordb) applied to Tokyo's two major airports -- pure pattern
// guesses, no evidence either way.
const PS_PLUS_TOKYO_DATACENTER_GUESSES = [
  'tyoa',
  'tyob',
  'nrta',
  'nrtb',
  'hnda',
  'hndb',
];

function SectionLabel({title}: {title: string}) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

const SettingsView: React.FC<Props> = ({
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
  psPlusDatacenterOptions,
  xcloudCatalogDescription,
  gfnCatalogDescription,
  gfnPlaytimeDescription,
  onChangeLane,
  updateSetting,
  onLocaleChange,
  onForceRegionChange,
  onUseMsalLoginChange,
  onPreferredLanguageChange,
  onLowLatencyDecoderChange,
  onSignalingCloudChange,
  onItemPress,
  onGfnAccountPress,
  onPsPlusAccountPress,
  onNavigatePsPlusLibrary,
  onCopyPsPlusDebugInfo,
  onXcloudAccountPress,
  onXcloudCatalogReload,
  onGfnCatalogReload,
  onClearCache,
  onNavigateVirtualGamepadSettings,
  onNavigateHistory,
  onNavigateDs5Left,
  onNavigateDs5Right,
}) => {
  return (
    <View style={styles.container}>
      <Spinner loading={loading} text={t('Loading...')} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('Settings')}</Text>
        <SegmentedButtons
          value={lane}
          onValueChange={value => onChangeLane(value as Lane)}
          buttons={[
            {value: 'common', label: t('CommonSettings')},
            {value: 'xbox', label: t('XcloudSettings')},
            {value: 'gfn', label: t('GfnSettings')},
            {value: 'psplus', label: t('PsPlusSettings')},
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
            onChange={onLocaleChange}
          />
          <SectionLabel title={t('DisplaySettings')} />
          <SwitchRow
            title={M('native_low_latency_decoder').title}
            desc={M('native_low_latency_decoder').description}
            value={settings.native_low_latency_decoder}
            onChange={onLowLatencyDecoderChange}
          />

          <SectionLabel title={t('GamepadSettings')} />
          <SettingItem
            title={t('Key mapping')}
            description={t('Mapping key of gamepad')}
            onPress={() => onItemPress('maping')}
          />
          <DropdownRow
            title={M('polling_rate').title}
            desc={M('polling_rate').description}
            options={M('polling_rate').data}
            value={settings.polling_rate}
            onChange={v => updateSetting('polling_rate', v)}
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

          <SectionLabel title={t('vGamepadSettings')} />
          <SettingItem
            title={t('Customize virtual buttons')}
            description={t('CustomizeButtonsWithMacroHint')}
            onPress={onNavigateVirtualGamepadSettings}
          />

          <SectionLabel title={t('AudioSettings')} />
          <SwitchRow
            title={M('enable_microphone').title}
            desc={M('enable_microphone').description}
            value={settings.enable_microphone}
            onChange={v => updateSetting('enable_microphone', v)}
            flag={gfnNoOpFlag}
          />

          <SectionLabel title={t('Others')} />
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
            onPress={() => onClearCache()}
          />
          <SettingItem
            title={t('HistoryTitle')}
            description={`${t('HistoryDesc')}`}
            onPress={onNavigateHistory}
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
            onPress={onXcloudAccountPress}
          />
          <SettingItem
            title={t('CatalogCacheTitle')}
            description={xcloudCatalogDescription}
            onPress={onXcloudCatalogReload}
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
            onChange={onForceRegionChange}
          />
          <DropdownRow
            title={M('signaling_cloud').title}
            desc={M('signaling_cloud').description}
            options={signalingCloudOptions}
            value={signalingCloudValue}
            onChange={onSignalingCloudChange}
            emptyLabel={t('Default')}
          />

          <SectionLabel title={t('SectionSignInLanguage')} />
          <DropdownRow
            title={M('preferred_game_language').title}
            desc={M('preferred_game_language').description}
            options={M('preferred_game_language').data}
            value={settings.preferred_game_language}
            onChange={onPreferredLanguageChange}
          />
          <SwitchRow
            title={M('use_msal_login').title}
            desc={M('use_msal_login').description}
            value={settings.use_msal_login}
            onChange={onUseMsalLoginChange}
          />

          <SectionLabel title={t('SectionControllers')} />
          <SettingItem
            title={t('DualSense_adaptive_trigger_left')}
            description={`${t('DualSense_adaptive_trigger_left_desc')}`}
            onPress={onNavigateDs5Left}
          />
          <SettingItem
            title={t('DualSense_adaptive_trigger_right')}
            description={`${t('DualSense_adaptive_trigger_right_desc')}`}
            onPress={onNavigateDs5Right}
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
            onPress={onGfnAccountPress}
          />
          <SettingItem
            title={t('CatalogCacheTitle')}
            description={gfnCatalogDescription}
            onPress={onGfnCatalogReload}
          />
          <InfoRow
            title={t('GfnPlaytimeTitle')}
            value={gfnPlaytimeDescription}
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

      {lane === 'psplus' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('SectionAccount')} />
          <SettingItem
            title={t('PsPlusAccountTitle')}
            description={
              psPlusSignedIn
                ? t('PsPlusSignedIn')
                : t('PsPlusAccountSignedOutDesc')
            }
            onPress={onPsPlusAccountPress}
          />
          {psPlusSignedIn && (
            <SettingItem
              title={t('PsPlusLibraryTitle')}
              description={t('PsPlusBrowseLibraryDesc')}
              onPress={onNavigatePsPlusLibrary}
            />
          )}

          <SectionLabel title={t('SectionVideo')} />
          <SegmentedRow
            title={M('psplus_resolution').title}
            desc={M('psplus_resolution').description}
            options={M('psplus_resolution').data}
            value={settings.psplus_resolution}
            onChange={v => updateSetting('psplus_resolution', v)}
            accent={PS_ACCENT}
          />
          <SegmentedRow
            title={M('psplus_fps').title}
            desc={M('psplus_fps').description}
            options={M('psplus_fps').data}
            value={settings.psplus_fps}
            onChange={v => updateSetting('psplus_fps', v)}
            accent={PS_ACCENT}
          />
          <SegmentedRow
            title={M('psplus_bitrate_mode').title}
            desc={M('psplus_bitrate_mode').description}
            options={M('psplus_bitrate_mode').data}
            value={settings.psplus_bitrate_mode}
            onChange={v => updateSetting('psplus_bitrate_mode', v)}
            accent={PS_ACCENT}
          />
          {settings.psplus_bitrate_mode === 'custom' && (
            <SliderRow
              title={t('Custom')}
              min={5000}
              max={25000}
              step={500}
              value={settings.psplus_bitrate_kbps}
              onChange={v => updateSetting('psplus_bitrate_kbps', v)}
              formatValue={v => `${(v / 1000).toFixed(1)} Mbps`}
              accent={PS_ACCENT}
            />
          )}
          <DropdownRow
            title={M('psplus_datacenter').title}
            desc={M('psplus_datacenter').description}
            options={psPlusDatacenterOptions}
            value={settings.psplus_datacenter}
            onChange={v => updateSetting('psplus_datacenter', v)}
            accent={PS_ACCENT}
            emptyLabel={t('Auto')}
          />
          <TextInputRow
            title={t('PsPlusDatacenterManualTitle')}
            desc={t('PsPlusDatacenterManualDesc')}
            value={settings.psplus_datacenter}
            placeholder={t('Auto')}
            onChange={v => updateSetting('psplus_datacenter', v)}
            suggestions={PS_PLUS_TOKYO_DATACENTER_GUESSES.map(code => ({
              value: code,
              text: code,
            }))}
            accent={PS_ACCENT}
          />

          {psPlusSignedIn && (
            <>
              <SectionLabel title={t('SectionDebug')} />
              <SettingItem
                title={t('PsPlusCopyDebugInfoTitle')}
                description={t('PsPlusCopyDebugInfoDesc')}
                onPress={onCopyPsPlusDebugInfo}
              />
            </>
          )}
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
};

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

export default SettingsView;
