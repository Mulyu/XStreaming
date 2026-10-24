import React from 'react';
import {View, StyleSheet, Pressable, Animated, Easing} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';
import {RailButton, SegOption} from '../../../shared/ui/RailControls';
import {TV_FOCUS_COLOR as FOCUS_COLOR} from '../../../shared/ui/tvFocus';
import {alpha, palette} from '../../../shared/config/palette';

export type StreamInputMode = 'off' | 'gamepad' | 'mouse' | 'touch';

export interface StreamControlRailProps {
  visible: boolean;
  onClose: () => void;
  // Explicit screen height (from useWindowDimensions()) rather than relying
  // on `top: 0` + `bottom: 0` to resolve the rail's height from its
  // positioned ancestor's own flex-resolved size -- that ancestor is the
  // stream screen's own root `container` view, several flex:1 levels below
  // the Activity's decor view, and on Google TV this rail has been reported
  // rendering as a small box pinned to the bottom-right corner instead of
  // filling the right edge top-to-bottom, consistent with that chain not
  // having a resolved height yet when the rail mounts. An explicit height
  // needs nothing upstream to have resolved.
  screenHeight: number;
  streamType?: string;
  connected: boolean;
  inputMode: StreamInputMode;
  onSetInputMode: (mode: StreamInputMode) => void;
  showMouseOption: boolean;
  showEditGamepadLayout: boolean;
  onEditGamepadLayout: () => void;
  showMouseSensitivity: boolean;
  mouseSensitivity: number;
  onMouseSensitivityChange: (value: number) => void;
  vibrationEnabled: boolean;
  onToggleVibration: () => void;
  showKeyboardOption: boolean;
  keyboardVisible: boolean;
  onToggleKeyboard: () => void;
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
  screenPosition: 'top' | 'center' | 'bottom';
  onSetScreenPosition: (position: 'top' | 'center' | 'bottom') => void;
  videoFormat: string;
  onCycleVideoFormat: () => void;
  fsrEnabled: boolean;
  onToggleFsr: () => void;
  onPressNexus: () => void;
  onDisconnect: () => void;
}

const StreamControlRail: React.FC<StreamControlRailProps> = ({
  visible,
  onClose,
  screenHeight,
  streamType,
  connected,
  inputMode,
  onSetInputMode,
  showMouseOption,
  showEditGamepadLayout,
  onEditGamepadLayout,
  showMouseSensitivity,
  mouseSensitivity,
  onMouseSensitivityChange,
  vibrationEnabled,
  onToggleVibration,
  showKeyboardOption,
  keyboardVisible,
  onToggleKeyboard,
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
  screenPosition,
  onSetScreenPosition,
  videoFormat,
  onCycleVideoFormat,
  fsrEnabled,
  onToggleFsr,
  onPressNexus,
  onDisconnect,
}) => {
  const {t} = useTranslation();
  const accent =
    streamType === 'gfn' ? palette.provider.gfn : palette.provider.xbox;
  const videoFormatLabel =
    videoFormat === ''
      ? t('Aspect ratio')
      : videoFormat === 'Stretch'
      ? t('Stretch')
      : videoFormat === 'Zoom'
      ? t('Zoom')
      : videoFormat;
  const [liveVolume, setLiveVolume] = React.useState(volume);
  React.useEffect(() => setLiveVolume(volume), [volume]);
  const [closeFocused, setCloseFocused] = React.useState(false);
  const [liveMouseSensitivity, setLiveMouseSensitivity] =
    React.useState(mouseSensitivity);
  React.useEffect(
    () => setLiveMouseSensitivity(mouseSensitivity),
    [mouseSensitivity],
  );
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
        onPress={onClose}
        onFocus={() => setCloseFocused(true)}
        onBlur={() => setCloseFocused(false)}
        android_ripple={{color: alpha(palette.white, 0.15)}}>
        <Icon source="close" size={16} color={palette.textSoft} />
      </Pressable>

      {connected && (
        <>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>{t('Input')}</Text>
            <View style={styles.segRow}>
              <SegOption
                icon="close-circle-outline"
                label={t('Off')}
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
              <SegOption
                icon="gesture-tap"
                label={t('Native touch')}
                active={inputMode === 'touch'}
                accent={accent}
                onPress={() => onSetInputMode('touch')}
              />
            </View>
            {showEditGamepadLayout && (
              <RailButton
                icon="pencil-outline"
                label={t('Edit Virtual Gamepad')}
                accent={accent}
                onPress={onEditGamepadLayout}
              />
            )}
            {showMouseSensitivity && (
              <View style={styles.sliderRow}>
                <View style={styles.sliderHead}>
                  <Text style={styles.sliderHeadLabel}>
                    {t('Mouse sensitivity')}
                  </Text>
                  <Text style={styles.sliderHeadValue}>
                    {liveMouseSensitivity.toFixed(1)}x
                  </Text>
                </View>
                <RNSlider
                  style={styles.sliderTrack}
                  minimumValue={0.5}
                  maximumValue={3}
                  step={0.1}
                  value={mouseSensitivity}
                  onValueChange={setLiveMouseSensitivity}
                  onSlidingComplete={onMouseSensitivityChange}
                  minimumTrackTintColor={accent}
                  maximumTrackTintColor={alpha(palette.white, 0.14)}
                  thumbTintColor={accent}
                />
              </View>
            )}
            <RailButton
              icon={vibrationEnabled ? 'vibrate' : 'vibrate-off'}
              label={t('Vibration')}
              active={vibrationEnabled}
              accent={accent}
              onPress={onToggleVibration}
            />
            {showKeyboardOption && (
              <RailButton
                icon="keyboard-outline"
                label={t('Keyboard')}
                active={keyboardVisible}
                accent={accent}
                onPress={onToggleKeyboard}
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
                maximumTrackTintColor={alpha(palette.white, 0.14)}
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

          <View style={styles.group}>
            <Text style={styles.groupLabel}>{t('Game screen position')}</Text>
            <View style={styles.segRow}>
              <SegOption
                icon="align-vertical-top"
                label={t('Top')}
                active={screenPosition === 'top'}
                accent={accent}
                onPress={() => onSetScreenPosition('top')}
              />
              <SegOption
                icon="align-vertical-center"
                label={t('Center')}
                active={screenPosition === 'center'}
                accent={accent}
                onPress={() => onSetScreenPosition('center')}
              />
              <SegOption
                icon="align-vertical-bottom"
                label={t('Bottom')}
                active={screenPosition === 'bottom'}
                accent={accent}
                onPress={() => onSetScreenPosition('bottom')}
              />
            </View>
            <RailButton
              icon="aspect-ratio"
              label={videoFormatLabel}
              accent={accent}
              onPress={onCycleVideoFormat}
            />
            <RailButton
              icon="auto-fix"
              label={t('FSR')}
              active={fsrEnabled}
              accent={accent}
              onPress={onToggleFsr}
            />
          </View>

          <View style={[styles.group, styles.sessionGroup]}>
            <Text style={styles.groupLabel}>{t('Session')}</Text>
            <RailButton
              icon="microsoft-xbox"
              label={t('Press Nexus')}
              accent={accent}
              onPress={onPressNexus}
            />
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

export default StreamControlRail;
