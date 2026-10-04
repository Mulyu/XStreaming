import React from 'react';
import {View, StyleSheet, Pressable, Animated, Easing} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';

const PS_ACCENT = '#0070D1';
const FOCUS_COLOR = '#FFD54A';

// Grouped-section layout ported from native-stream's own StreamControlRail
// (same group labels, segmented control, slider, and focus-ring styling),
// scoped to only what actually applies to a PS5 cloud session: no input-
// mode switch (PS Plus is gamepad-only -- no mouse/touch modes exist
// server-side), no mouse sensitivity/keyboard (mouse-mode-only on GFN), no
// microphone (no 2-way voice chat channel here), no FSR (a WebRTC-renderer-
// only upscaling pipeline, unrelated to this decoder), no Press Nexus (no
// PS5-equivalent chord button to synthesize).
type Props = Pick<
  PsPlusStreamViewModel,
  | 't'
  | 'showControlRail'
  | 'onCloseControlRail'
  | 'vibrationEnabled'
  | 'onToggleVibration'
  | 'performanceVisible'
  | 'onTogglePerformance'
  | 'metrics'
  | 'screenPosition'
  | 'onSetScreenPosition'
  | 'videoFormat'
  | 'onCycleVideoFormat'
  | 'audioGain'
  | 'onAudioGainChange'
  | 'onEditGamepadLayout'
  | 'showVirtualGamepad'
  | 'onToggleVirtualGamepad'
  | 'coverAvailable'
  | 'coverPresented'
  | 'onToggleCoverControls'
  | 'onRailDisconnect'
>;

const RailButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({icon, label, onPress, active, danger}) => {
  const [focused, setFocused] = React.useState(false);
  const iconColor = danger ? '#ff5347' : active ? PS_ACCENT : '#8a9a92';
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
  onPress: () => void;
}> = ({icon, label, active, onPress}) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      style={[
        styles.segOpt,
        active && {backgroundColor: PS_ACCENT},
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

const PsPlusControlRail: React.FC<Props> = ({
  t,
  showControlRail,
  onCloseControlRail,
  vibrationEnabled,
  onToggleVibration,
  performanceVisible,
  onTogglePerformance,
  metrics,
  screenPosition,
  onSetScreenPosition,
  videoFormat,
  onCycleVideoFormat,
  audioGain,
  onAudioGainChange,
  onEditGamepadLayout,
  showVirtualGamepad,
  onToggleVirtualGamepad,
  coverAvailable,
  coverPresented,
  onToggleCoverControls,
  onRailDisconnect,
}) => {
  const videoFormatLabel =
    videoFormat === ''
      ? t('Aspect ratio')
      : videoFormat === 'Stretch'
      ? t('Stretch')
      : videoFormat === 'Zoom'
      ? t('Zoom')
      : videoFormat;
  const [liveVolume, setLiveVolume] = React.useState(audioGain);
  React.useEffect(() => setLiveVolume(audioGain), [audioGain]);
  const [closeFocused, setCloseFocused] = React.useState(false);
  const slideIn = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!showControlRail) {
      return;
    }
    slideIn.setValue(0);
    Animated.timing(slideIn, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showControlRail, slideIn]);

  if (!showControlRail) {
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
        style={[styles.closeBtn, closeFocused && styles.closeBtnFocused]}
        onPress={onCloseControlRail}
        onFocus={() => setCloseFocused(true)}
        onBlur={() => setCloseFocused(false)}
        android_ripple={{color: 'rgba(255,255,255,0.15)'}}>
        <Icon source="close" size={16} color="#8a9a92" />
      </Pressable>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Input')}</Text>
        <RailButton
          icon={
            showVirtualGamepad ? 'gamepad-variant' : 'gamepad-variant-outline'
          }
          label={t('Virtual gamepad')}
          active={showVirtualGamepad}
          onPress={onToggleVirtualGamepad}
        />
        <RailButton
          icon="pencil-outline"
          label={t('Edit Virtual Gamepad')}
          onPress={onEditGamepadLayout}
        />
        <RailButton
          icon={vibrationEnabled ? 'vibrate' : 'vibrate-off'}
          label={t('Vibration')}
          active={vibrationEnabled}
          onPress={onToggleVibration}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Audio')}</Text>
        <View style={styles.sliderRow}>
          <View style={styles.sliderHead}>
            <Text style={styles.sliderHeadLabel}>{t('Volume')}</Text>
            <Text style={styles.sliderHeadValue}>{liveVolume.toFixed(1)}x</Text>
          </View>
          <RNSlider
            style={styles.sliderTrack}
            minimumValue={0}
            maximumValue={1}
            step={0.1}
            value={audioGain}
            onValueChange={setLiveVolume}
            onSlidingComplete={onAudioGainChange}
            minimumTrackTintColor={PS_ACCENT}
            maximumTrackTintColor="rgba(255,255,255,0.14)"
            thumbTintColor={PS_ACCENT}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Display')}</Text>
        <RailButton
          icon="chart-line"
          label={t('Perf stats')}
          active={performanceVisible}
          onPress={onTogglePerformance}
        />
        {performanceVisible && metrics && (
          <View style={styles.metrics}>
            <Text style={styles.metricLine}>
              {metrics.width}x{metrics.height} @ {Math.round(metrics.fps)}fps
            </Text>
            <Text style={styles.metricLine}>
              {metrics.bitrateMbps.toFixed(1)} Mbps · {metrics.rttMs}ms
            </Text>
            <Text style={styles.metricLine}>
              {(metrics.packetLoss * 100).toFixed(1)}% loss ·{' '}
              {metrics.droppedFrames} dropped
            </Text>
          </View>
        )}
        {coverAvailable && (
          <RailButton
            icon="image-outline"
            label={t('Cover controls')}
            active={coverPresented}
            onPress={onToggleCoverControls}
          />
        )}
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Game screen position')}</Text>
        <View style={styles.segRow}>
          <SegOption
            icon="align-vertical-top"
            label={t('Top')}
            active={screenPosition === 'top'}
            onPress={() => onSetScreenPosition('top')}
          />
          <SegOption
            icon="align-vertical-center"
            label={t('Center')}
            active={screenPosition === 'center'}
            onPress={() => onSetScreenPosition('center')}
          />
          <SegOption
            icon="align-vertical-bottom"
            label={t('Bottom')}
            active={screenPosition === 'bottom'}
            onPress={() => onSetScreenPosition('bottom')}
          />
        </View>
        <RailButton
          icon="aspect-ratio"
          label={videoFormatLabel}
          onPress={onCycleVideoFormat}
        />
      </View>

      <View style={[styles.group, styles.sessionGroup]}>
        <Text style={styles.groupLabel}>{t('Session')}</Text>
        <RailButton
          icon="power"
          label={t('Disconnect')}
          danger
          onPress={onRailDisconnect}
        />
      </View>
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
  closeBtnFocused: {
    borderWidth: 2,
    borderColor: FOCUS_COLOR,
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
  metrics: {
    paddingHorizontal: 4,
    gap: 2,
  },
  metricLine: {fontSize: 11, color: '#8a9a92'},
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

export default PsPlusControlRail;
