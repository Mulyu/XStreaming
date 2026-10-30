import React from 'react';
import {View, StyleSheet, Animated, Easing, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';
import {
  RailButton,
  RailIconButton,
  RailSectionLabel,
  RailTile,
  RailTileRow,
  SegOption,
} from '../../../shared/ui/RailControls';
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
  // Silences the game without moving the volume slider.
  muted: boolean;
  onToggleMute: () => void;
  performanceVisible: boolean;
  onTogglePerformance: () => void;
  showCoverControls: boolean;
  coverPresented: boolean;
  onToggleCoverControls: () => void;
  screenPosition: 'top' | 'center' | 'bottom';
  onSetScreenPosition: (position: 'top' | 'center' | 'bottom') => void;
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
  muted,
  onToggleMute,
  performanceVisible,
  onTogglePerformance,
  showCoverControls,
  coverPresented,
  onToggleCoverControls,
  screenPosition,
  onSetScreenPosition,
  fsrEnabled,
  onToggleFsr,
  onPressNexus,
  onDisconnect,
}) => {
  const {t} = useTranslation();
  const accent =
    streamType === 'gfn' ? palette.provider.gfn : palette.provider.xbox;
  const [liveVolume, setLiveVolume] = React.useState(volume);
  React.useEffect(() => setLiveVolume(volume), [volume]);
  const [liveMouseSensitivity, setLiveMouseSensitivity] =
    React.useState(mouseSensitivity);
  React.useEffect(
    () => setLiveMouseSensitivity(mouseSensitivity),
    [mouseSensitivity],
  );
  // The focused tile's name, shown beside its section's heading so the tile
  // rows need no text of their own.
  const [caption, setCaption] = React.useState<{
    section: 'input' | 'display';
    text: string;
  } | null>(null);
  const tileCaption = (section: 'input' | 'display') => ({
    onFocusLabel: (text: string) => setCaption({section, text}),
    onBlurLabel: () =>
      setCaption(current => (current?.section === section ? null : current)),
  });
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
      <View style={styles.topRow}>
        {connected && (
          <RailIconButton
            icon="microsoft-xbox"
            label={t('Press Nexus')}
            accent={accent}
            onPress={onPressNexus}
          />
        )}
        <RailIconButton
          icon="power"
          label={t('Disconnect')}
          accent={accent}
          danger
          onPress={onDisconnect}
        />
        <View style={styles.topSpacer} />
        <RailIconButton
          icon="close"
          label={t('Close')}
          accent={accent}
          onPress={onClose}
        />
      </View>

      {/* The contents scroll: on a short screen (a TV) the groups no longer
          fit, and a fixed-height rail would squeeze them together. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {connected && (
          <>
            <View style={styles.group}>
              <RailSectionLabel
                title={t('Input')}
                caption={
                  caption?.section === 'input' ? caption.text : undefined
                }
              />
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
                  label={t('Edit layout')}
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
              <RailTileRow>
                <RailTile
                  icon={vibrationEnabled ? 'vibrate' : 'vibrate-off'}
                  label={t('Vibration')}
                  active={vibrationEnabled}
                  accent={accent}
                  onPress={onToggleVibration}
                  {...tileCaption('input')}
                />
                {showKeyboardOption && (
                  <RailTile
                    icon="keyboard-outline"
                    label={t('Keyboard')}
                    active={keyboardVisible}
                    accent={accent}
                    onPress={onToggleKeyboard}
                    {...tileCaption('input')}
                  />
                )}
              </RailTileRow>
            </View>

            <View style={styles.group}>
              <RailSectionLabel title={t('Audio')} />
              {showMicrophone && (
                <RailButton
                  icon={microphoneOpen ? 'microphone' : 'microphone-off'}
                  label={t('Microphone')}
                  active={microphoneOpen}
                  accent={accent}
                  onPress={onToggleMicrophone}
                />
              )}
              <View style={styles.volumeRow}>
                <RailIconButton
                  icon={muted ? 'volume-off' : 'volume-high'}
                  label={t('Mute')}
                  accent={accent}
                  active={muted}
                  onPress={onToggleMute}
                />
                <RNSlider
                  style={styles.volumeTrack}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.1}
                  value={volume}
                  onValueChange={setLiveVolume}
                  onSlidingComplete={onVolumeChange}
                  minimumTrackTintColor={muted ? palette.textDim : accent}
                  maximumTrackTintColor={alpha(palette.white, 0.14)}
                  thumbTintColor={muted ? palette.textDim : accent}
                />
                <Text style={styles.volumeValue}>{liveVolume.toFixed(1)}x</Text>
              </View>
            </View>

            <View style={styles.group}>
              <RailSectionLabel
                title={t('Display')}
                caption={
                  caption?.section === 'display' ? caption.text : undefined
                }
              />
              <RailTileRow>
                <RailTile
                  icon="chart-line"
                  label={t('Perf stats')}
                  active={performanceVisible}
                  accent={accent}
                  onPress={onTogglePerformance}
                  {...tileCaption('display')}
                />
                <RailTile
                  icon="auto-fix"
                  label={t('FSR')}
                  active={fsrEnabled}
                  accent={accent}
                  onPress={onToggleFsr}
                  {...tileCaption('display')}
                />
                {showCoverControls && (
                  <RailTile
                    icon="image-outline"
                    label={t('Cover controls')}
                    active={coverPresented}
                    accent={accent}
                    onPress={onToggleCoverControls}
                    {...tileCaption('display')}
                  />
                )}
              </RailTileRow>
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
            </View>
          </>
        )}
      </ScrollView>
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
  scroll: {flex: 1},
  scrollContent: {gap: 14, flexGrow: 1},
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topSpacer: {flex: 1},
  group: {
    gap: 6,
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
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  volumeTrack: {
    flex: 1,
    height: 28,
  },
  volumeValue: {
    width: 26,
    fontSize: 9.5,
    color: palette.textSoft,
    textAlign: 'right',
  },
});

export default StreamControlRail;
