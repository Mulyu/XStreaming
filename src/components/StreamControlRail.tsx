import React from 'react';
import {View, StyleSheet, Pressable, Animated, Easing} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

export type StreamInputMode = 'off' | 'gamepad' | 'mouse';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const FOCUS_COLOR = '#FFD54A';

export interface StreamControlRailProps {
  visible: boolean;
  onClose: () => void;
  streamType?: string;
  connected: boolean;
  inputMode: StreamInputMode;
  onSetInputMode: (mode: StreamInputMode) => void;
  showMouseOption: boolean;
  showEditGamepadLayout: boolean;
  onEditGamepadLayout: () => void;
  showMicrophone: boolean;
  microphoneOpen: boolean;
  onToggleMicrophone: () => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  performanceVisible: boolean;
  onTogglePerformance: () => void;
  showCoverControls: boolean;
  coverPresented: boolean;
  onToggleCoverControls: () => void;
  showConsoleActions: boolean;
  onPressNexus: () => void;
  onLongPressNexus: () => void;
  onSendText: () => void;
  showPowerOff: boolean;
  onDisconnectPowerOff: () => void;
  onDisconnect: () => void;
}

const RailButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  accent: string;
}> = ({icon, label, onPress, active, danger, accent}) => {
  const [focused, setFocused] = React.useState(false);
  const iconColor = danger ? '#ff5347' : active ? accent : '#8a9a92';
  return (
    <Pressable
      style={[
        styles.railBtn,
        focused && styles.railBtnFocused,
        active && !danger && styles.railBtnActive,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: 'rgba(255,255,255,0.15)'}}>
      <Icon source={icon} size={18} color={iconColor} />
      <Text
        style={[styles.railBtnLabel, danger && styles.railBtnLabelDanger]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

const SegOption: React.FC<{
  icon: string;
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}> = ({icon, label, active, accent, onPress}) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      style={[
        styles.segOpt,
        active && {backgroundColor: accent},
        focused && styles.segOptFocused,
      ]}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: 'rgba(255,255,255,0.2)'}}>
      <Icon source={icon} size={18} color={active ? '#0a0f0c' : '#8a9a92'} />
    </Pressable>
  );
};

const StreamControlRail: React.FC<StreamControlRailProps> = ({
  visible,
  onClose,
  streamType,
  connected,
  inputMode,
  onSetInputMode,
  showMouseOption,
  showEditGamepadLayout,
  onEditGamepadLayout,
  showMicrophone,
  microphoneOpen,
  onToggleMicrophone,
  volume,
  onVolumeChange,
  performanceVisible,
  onTogglePerformance,
  showCoverControls,
  coverPresented,
  onToggleCoverControls,
  showConsoleActions,
  onPressNexus,
  onLongPressNexus,
  onSendText,
  showPowerOff,
  onDisconnectPowerOff,
  onDisconnect,
}) => {
  const {t} = useTranslation();
  const accent = streamType === 'gfn' ? NVIDIA_ACCENT : XBOX_ACCENT;
  const [liveVolume, setLiveVolume] = React.useState(volume);
  React.useEffect(() => setLiveVolume(volume), [volume]);
  const slideIn = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    slideIn.setValue(0);
    Animated.timing(slideIn, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slideIn]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.rail,
        {
          transform: [
            {
              translateX: slideIn.interpolate({
                inputRange: [0, 1],
                outputRange: [220, 0],
              }),
            },
          ],
        },
      ]}>
      <Pressable
        style={styles.closeBtn}
        onPress={onClose}
        android_ripple={{color: 'rgba(255,255,255,0.15)'}}>
        <Icon source="close" size={16} color="#8a9a92" />
      </Pressable>

      {connected && (
        <>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>{t('Input')}</Text>
            <View style={styles.segRow}>
              <SegOption
                icon="cursor-default-click-outline"
                label={t('Touch off')}
                active={inputMode === 'off'}
                accent={accent}
                onPress={() => onSetInputMode('off')}
              />
              <SegOption
                icon="gamepad-variant"
                label={t('Virtual gamepad')}
                active={inputMode === 'gamepad'}
                accent={accent}
                onPress={() => onSetInputMode('gamepad')}
              />
              {showMouseOption && (
                <SegOption
                  icon="mouse"
                  label={t('Mouse trackpad')}
                  active={inputMode === 'mouse'}
                  accent={accent}
                  onPress={() => onSetInputMode('mouse')}
                />
              )}
            </View>
            {showEditGamepadLayout && (
              <RailButton
                icon="pencil-outline"
                label={t('Edit Virtual Gamepad')}
                accent={accent}
                onPress={onEditGamepadLayout}
              />
            )}
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>{t('Audio')}</Text>
            {showMicrophone && (
              <RailButton
                icon={microphoneOpen ? 'microphone' : 'microphone-off'}
                label={t('Microphone')}
                active={microphoneOpen}
                accent={accent}
                onPress={onToggleMicrophone}
              />
            )}
            <View style={styles.sliderRow}>
              <View style={styles.sliderHead}>
                <Text style={styles.sliderHeadLabel}>{t('Volume')}</Text>
                <Text style={styles.sliderHeadValue}>
                  {liveVolume.toFixed(1)}x
                </Text>
              </View>
              <RNSlider
                style={styles.sliderTrack}
                minimumValue={0}
                maximumValue={1}
                step={0.1}
                value={volume}
                onValueChange={setLiveVolume}
                onSlidingComplete={onVolumeChange}
                minimumTrackTintColor={accent}
                maximumTrackTintColor="rgba(255,255,255,0.14)"
                thumbTintColor={accent}
              />
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>{t('Display')}</Text>
            <RailButton
              icon="chart-line"
              label={t('Perf stats')}
              active={performanceVisible}
              accent={accent}
              onPress={onTogglePerformance}
            />
            {showCoverControls && (
              <RailButton
                icon="image-outline"
                label={t('Cover controls')}
                active={coverPresented}
                accent={accent}
                onPress={onToggleCoverControls}
              />
            )}
          </View>

          <View style={[styles.group, styles.sessionGroup]}>
            <Text style={styles.groupLabel}>{t('Session')}</Text>
            <RailButton
              icon="microsoft-xbox"
              label={t('Press Nexus')}
              accent={accent}
              onPress={onPressNexus}
            />
            {showConsoleActions && (
              <RailButton
                icon="gesture-tap-hold"
                label={t('Long press Nexus')}
                accent={accent}
                onPress={onLongPressNexus}
              />
            )}
            {showConsoleActions && (
              <RailButton
                icon="keyboard-outline"
                label={t('Send text')}
                accent={accent}
                onPress={onSendText}
              />
            )}
            {showPowerOff && (
              <RailButton
                icon="power-plug-off-outline"
                label={t('Disconnect and power off')}
                accent={accent}
                danger
                onPress={onDisconnectPowerOff}
              />
            )}
            <RailButton
              icon="power"
              label={t('Disconnect')}
              accent={accent}
              danger
              onPress={onDisconnect}
            />
          </View>
        </>
      )}

      {!connected && (
        <View style={[styles.group, styles.sessionGroup]}>
          <RailButton
            icon="power"
            label={t('Disconnect')}
            accent={accent}
            danger
            onPress={onDisconnect}
          />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 200,
    backgroundColor: 'rgba(8,11,10,0.92)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(238,244,239,0.14)',
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 14,
    zIndex: 100,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  group: {
    gap: 6,
  },
  sessionGroup: {
    marginTop: 'auto',
  },
  groupLabel: {
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#5c6963',
    paddingHorizontal: 4,
  },
  segRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 9,
    padding: 2,
    gap: 2,
  },
  segOpt: {
    flex: 1,
    height: 34,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOptFocused: {
    borderWidth: 2,
    borderColor: FOCUS_COLOR,
  },
  railBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  railBtnFocused: {
    borderWidth: 2,
    borderColor: FOCUS_COLOR,
  },
  railBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  railBtnLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#eef4ef',
    flexShrink: 1,
  },
  railBtnLabelDanger: {
    color: '#ff5347',
  },
  sliderRow: {
    gap: 4,
    paddingHorizontal: 4,
  },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderHeadLabel: {
    fontSize: 9.5,
    color: '#8a9a92',
  },
  sliderHeadValue: {
    fontSize: 9.5,
    color: '#8a9a92',
  },
  sliderTrack: {
    height: 28,
    width: '100%',
  },
});

export default StreamControlRail;
