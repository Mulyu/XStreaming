import React from 'react';
import {View, StyleSheet, Pressable, Animated, Easing} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';
import {RailButton, SegOption} from '../../../shared/ui/RailControls';
import {TV_FOCUS_COLOR as FOCUS_COLOR} from '../../../shared/ui/tvFocus';
import {alpha, palette} from '../../../shared/config/palette';

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
  | 'touchpadVisible'
  | 'onToggleTouchpad'
  | 'coverAvailable'
  | 'coverPresented'
  | 'onToggleCoverControls'
  | 'onRailDisconnect'
> & {
  // Explicit screen height (from useWindowDimensions()) -- see
  // StreamControlRail.tsx's identical prop for why this replaces relying on
  // `top: 0` + `bottom: 0` to resolve the rail's height from its positioned
  // ancestor's own flex-resolved size.
  screenHeight: number;
};

const PsPlusControlRail: React.FC<Props> = ({
  t,
  screenHeight,
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
  touchpadVisible,
  onToggleTouchpad,
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
          height: screenHeight,
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
        android_ripple={{color: alpha(palette.white, 0.15)}}>
        <Icon source="close" size={16} color={palette.textSoft} />
      </Pressable>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Input')}</Text>
        <RailButton
          accent={palette.provider.ps}
          icon={
            showVirtualGamepad ? 'gamepad-variant' : 'gamepad-variant-outline'
          }
          label={t('Virtual gamepad')}
          active={showVirtualGamepad}
          onPress={onToggleVirtualGamepad}
        />
        <RailButton
          accent={palette.provider.ps}
          icon="gesture-swipe"
          label={t('Touchpad')}
          active={touchpadVisible}
          onPress={onToggleTouchpad}
        />
        <RailButton
          accent={palette.provider.ps}
          icon="pencil-outline"
          label={t('Edit Virtual Gamepad')}
          onPress={onEditGamepadLayout}
        />
        <RailButton
          accent={palette.provider.ps}
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
            minimumTrackTintColor={palette.provider.ps}
            maximumTrackTintColor={alpha(palette.white, 0.14)}
            thumbTintColor={palette.provider.ps}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{t('Display')}</Text>
        <RailButton
          accent={palette.provider.ps}
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
            accent={palette.provider.ps}
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
            accent={palette.provider.ps}
            icon="align-vertical-top"
            label={t('Top')}
            active={screenPosition === 'top'}
            onPress={() => onSetScreenPosition('top')}
          />
          <SegOption
            accent={palette.provider.ps}
            icon="align-vertical-center"
            label={t('Center')}
            active={screenPosition === 'center'}
            onPress={() => onSetScreenPosition('center')}
          />
          <SegOption
            accent={palette.provider.ps}
            icon="align-vertical-bottom"
            label={t('Bottom')}
            active={screenPosition === 'bottom'}
            onPress={() => onSetScreenPosition('bottom')}
          />
        </View>
        <RailButton
          accent={palette.provider.ps}
          icon="aspect-ratio"
          label={videoFormatLabel}
          onPress={onCycleVideoFormat}
        />
      </View>

      <View style={[styles.group, styles.sessionGroup]}>
        <Text style={styles.groupLabel}>{t('Session')}</Text>
        <RailButton
          accent={palette.provider.ps}
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
    width: 200,
    backgroundColor: alpha(palette.scrim, 0.92),
    borderLeftWidth: 1,
    borderLeftColor: alpha(palette.text, 0.14),
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
    backgroundColor: alpha(palette.white, 0.06),
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
    color: palette.textDim,
    paddingHorizontal: 4,
  },
  segRow: {
    flexDirection: 'row',
    backgroundColor: alpha(palette.black, 0.3),
    borderRadius: 9,
    padding: 2,
    gap: 2,
  },
  metrics: {
    paddingHorizontal: 4,
    gap: 2,
  },
  metricLine: {fontSize: 11, color: palette.textSoft},
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
    color: palette.textSoft,
  },
  sliderHeadValue: {
    fontSize: 9.5,
    color: palette.textSoft,
  },
  sliderTrack: {
    height: 28,
    width: '100%',
  },
});

export default PsPlusControlRail;
