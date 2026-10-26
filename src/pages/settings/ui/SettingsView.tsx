import React from 'react';
import {StyleSheet, ScrollView, View, Pressable} from 'react-native';
import {Text, Portal, Modal, Card} from 'react-native-paper';
import Spinner from '../../../shared/ui/Spinner';
import {useTVFocus, tvFocusBold} from '../../../shared/ui/tvFocus';
import SettingItem from '../../../shared/ui/SettingItem';
import {
  SwitchRow,
  SegmentedRow,
  DropdownRow,
  SliderRow,
} from '../../../shared/ui/InlineSettingRows';
import AccountCard from './AccountCard';
import {GfnSignInModal} from '../../../entities/gfn-account';
import {MsalAuth} from '../../../entities/xbox-token';
import {M} from '../model/useSettingsScreen';
import type {Lane, SettingsScreenViewModel} from '../model/useSettingsScreen';

import {alpha, palette} from '../../../shared/config/palette';

type Props = SettingsScreenViewModel;

// The provider switch: the same rounded pills as the Store's provider tabs,
// filled in the provider's own colour when selected.
function LaneButton({
  label,
  color,
  flex,
  active,
  onPress,
}: {
  label: string;
  color: string;
  flex: number;
  active: boolean;
  onPress: () => void;
}) {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[
        styles.laneButton,
        {flex},
        active && {backgroundColor: color, borderColor: color},
        focus.focused && tvFocusBold,
      ]}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole="button"
      accessibilityState={{selected: active}}>
      <Text
        style={[styles.laneButtonText, active && styles.laneButtonTextOn]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({title}: {title: string}) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

const SettingsView: React.FC<Props> = ({
  t,
  loading,
  xcloudLoginLoading,
  xcloudLoginText,
  msalData,
  onCancelXcloudLogin,
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
  signalingCloudOptions,
  signalingCloudValue,
  gfnRegionOptions,
  xboxAccount,
  gfnAccount,
  psAccount,
  onOpenPlan,
  onChangeLane,
  updateSetting,
  onLocaleChange,
  onForceRegionChange,
  onUseMsalLoginChange,
  onPreferredLanguageChange,
  onLowLatencyDecoderChange,
  onSignalingCloudChange,
  onGfnAccountPress,
  onCopyGfnDebugInfo,
  onCopyPsPlusDebugInfo,
  onCopyAppDebugInfo,
  onPsPlusAccountPress,
  onXcloudAccountPress,
  onNavigateInputMapping,
  onNavigateHistory,
  onNavigateDs5Left,
  onNavigateDs5Right,
}) => {
  const laneButtons: {
    value: Lane;
    label: string;
    color: string;
    flex: number;
  }[] = [
    {
      value: 'common',
      label: t('CommonSettings'),
      color: palette.accent,
      flex: 0.8,
    },
    {
      value: 'xbox',
      label: t('XcloudSettings'),
      color: palette.provider.xbox,
      flex: 0.9,
    },
    {
      value: 'gfn',
      label: t('GfnSettings'),
      color: palette.provider.gfn,
      flex: 1.45,
    },
    {
      value: 'psplus',
      label: t('PsPlusSettings'),
      color: palette.provider.ps,
      flex: 1.25,
    },
  ];
  const accountLabels = {
    signedIn: t('AccountSignedIn'),
    signedOut: t('AccountSignedOut'),
    plan: t('AccountPlan'),
    changePlan: t('AccountChangePlan'),
    signIn: t('AccountSignIn'),
    signOut: t('AccountSignOut'),
  };
  return (
    <View style={styles.container}>
      <Spinner
        loading={loading || xcloudLoginLoading}
        text={xcloudLoginLoading ? xcloudLoginText : t('Loading...')}
      />

      <View style={styles.header}>
        <Text style={styles.title}>{t('Settings')}</Text>
        <View style={styles.laneRow}>
          {laneButtons.map(button => (
            <LaneButton
              key={button.value}
              label={button.label}
              color={button.color}
              flex={button.flex}
              active={lane === button.value}
              onPress={() => onChangeLane(button.value)}
            />
          ))}
        </View>
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
            title={t('InputMapping')}
            description={t('InputMappingDesc')}
            onPress={onNavigateInputMapping}
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
          <SettingItem
            title={t('HistoryTitle')}
            description={`${t('HistoryDesc')}`}
            onPress={onNavigateHistory}
          />

          <SectionLabel title={t('SectionDebug')} />
          <SettingItem
            title={t('AppCopyDebugInfoTitle')}
            description={t('AppCopyDebugInfoDesc')}
            onPress={onCopyAppDebugInfo}
          />
        </ScrollView>
      )}

      {lane === 'xbox' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('SectionAccount')} />
          <AccountCard
            color={palette.provider.xbox}
            service="Xbox"
            signedIn={isAuthed}
            userName={xboxAccount.userName}
            planTitle={xboxAccount.planTitle}
            planLines={xboxAccount.planLines}
            labels={accountLabels}
            onSignIn={onXcloudAccountPress}
            onSignOut={onXcloudAccountPress}
            onChangePlan={() => onOpenPlan('xbox')}
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
            accent={palette.accent}
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
          <AccountCard
            color={palette.provider.gfn}
            service="GeForce NOW"
            signedIn={gfnSignedIn}
            userName={gfnAccount.userName}
            planTitle={gfnAccount.planTitle}
            planLines={gfnAccount.planLines}
            labels={accountLabels}
            onSignIn={onGfnAccountPress}
            onSignOut={onGfnAccountPress}
            onChangePlan={() => onOpenPlan('gfn')}
          />

          <SectionLabel title={t('SectionVideo')} />
          <SegmentedRow
            title={M('gfn_resolution').title}
            desc={M('gfn_resolution').description}
            options={M('gfn_resolution').data}
            value={settings.gfn_resolution}
            onChange={v => updateSetting('gfn_resolution', v)}
            accent={palette.provider.gfn}
          />
          <SegmentedRow
            title={M('gfn_fps').title}
            desc={M('gfn_fps').description}
            options={M('gfn_fps').data}
            value={settings.gfn_fps}
            onChange={v => updateSetting('gfn_fps', v)}
            accent={palette.provider.gfn}
          />
          <SegmentedRow
            title={M('gfn_bitrate_mode').title}
            desc={M('gfn_bitrate_mode').description}
            options={M('gfn_bitrate_mode').data}
            value={settings.gfn_bitrate_mode}
            onChange={v => updateSetting('gfn_bitrate_mode', v)}
            accent={palette.provider.gfn}
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
              accent={palette.provider.gfn}
            />
          )}
          <DropdownRow
            title={M('gfn_region').title}
            desc={M('gfn_region').description}
            options={gfnRegionOptions}
            value={settings.gfn_region}
            onChange={v => updateSetting('gfn_region', v)}
            accent={palette.provider.gfn}
            emptyLabel={t('Auto')}
          />

          {gfnSignedIn && (
            <>
              <SectionLabel title={t('SectionDebug')} />
              <SettingItem
                title={t('GfnCopyDebugInfoTitle')}
                description={t('GfnCopyDebugInfoDesc')}
                onPress={onCopyGfnDebugInfo}
              />
            </>
          )}
        </ScrollView>
      )}

      {lane === 'psplus' && (
        <ScrollView style={styles.settingsScroll}>
          <SectionLabel title={t('SectionAccount')} />
          <AccountCard
            color={palette.provider.ps}
            service="PlayStation"
            signedIn={psPlusSignedIn}
            userName={psAccount.userName}
            planTitle={psAccount.planTitle}
            planLines={psAccount.planLines}
            labels={accountLabels}
            onSignIn={onPsPlusAccountPress}
            onSignOut={onPsPlusAccountPress}
            onChangePlan={() => onOpenPlan('psplus')}
          />

          <SectionLabel title={t('SectionVideo')} />
          <SegmentedRow
            title={M('psplus_resolution').title}
            desc={M('psplus_resolution').description}
            options={M('psplus_resolution').data}
            value={settings.psplus_resolution}
            onChange={v => updateSetting('psplus_resolution', v)}
            accent={palette.provider.ps}
          />
          <SegmentedRow
            title={M('psplus_fps').title}
            desc={M('psplus_fps').description}
            options={M('psplus_fps').data}
            value={settings.psplus_fps}
            onChange={v => updateSetting('psplus_fps', v)}
            accent={palette.provider.ps}
          />
          <SegmentedRow
            title={M('psplus_bitrate_mode').title}
            desc={M('psplus_bitrate_mode').description}
            options={M('psplus_bitrate_mode').data}
            value={settings.psplus_bitrate_mode}
            onChange={v => updateSetting('psplus_bitrate_mode', v)}
            accent={palette.provider.ps}
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
              accent={palette.provider.ps}
            />
          )}

          <SectionLabel title={t('SectionDebug')} />
          <SettingItem
            title={t('PsPlusCopyDebugInfoTitle')}
            description={t('PsPlusCopyDebugInfoDesc')}
            onPress={onCopyPsPlusDebugInfo}
          />
        </ScrollView>
      )}

      {!!msalData && (
        <Portal>
          <Modal
            visible={true}
            onDismiss={onCancelXcloudLogin}
            contentContainerStyle={styles.msalModal}>
            <Card>
              <Card.Content>
                <MsalAuth data={msalData} />
              </Card.Content>
            </Card>
          </Modal>
        </Portal>
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
  msalModal: {marginLeft: '4%', marginRight: '4%'},
  settingsScroll: {
    flex: 1,
  },
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  laneRow: {flexDirection: 'row', gap: 8},
  // Same pill as the Store's provider tabs. A constant 1px border (the focus
  // ring swaps its colour) so gaining focus never resizes the button.
  laneButton: {
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.3),
    backgroundColor: alpha(palette.text, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneButtonText: {fontSize: 12.5, fontWeight: '700', color: palette.textSoft},
  laneButtonTextOn: {color: palette.onAccent},
  title: {fontSize: 18, fontWeight: '800'},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: palette.textSoft,
    marginTop: 18,
    marginBottom: 2,
    marginHorizontal: 16,
  },
});

export default SettingsView;
