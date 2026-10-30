import React from 'react';
import {View, StyleSheet, Animated, Easing, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';
import {
  RailButton,
  RailIconButton,
  RailSectionLabel,
  RailTile,
  RailTileRow,
  SegOption,
} from '../../../shared/ui/RailControls';
import {alpha, palette} from '../../../shared/config/palette';

// Same layout as native-stream's own StreamControlRail (icon buttons on top,
// Input / Audio / Display sections, icon tiles for the on/off switches),
// scoped to only what applies to a PS5 cloud session: no input-mode switch
// (the virtual gamepad and touchpad are independent toggles), no mouse
// sensitivity/keyboard (mouse-mode-only on GFN), no Press Nexus (no PS5
// equivalent chord button to synthesize). The microphone is sent natively
// (AudioRecord -> Opus -> takion).
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
  | 'audioGain'
  | 'audioMuted'
  | 'onToggleMute'
  | 'micOpen'
  | 'onToggleMic'
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
  audioGain,
  audioMuted,
  onToggleMute,
  micOpen,
  onToggleMic,
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
  const [liveVolume, setLiveVolume] = React.useState(audioGain);
  React.useEffect(() => setLiveVolume(audioGain), [audioGain]);
  // The focused tile's name, shown beside its section's heading.
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
      <View style={styles.topRow}>
        <RailIconButton
          icon="power"
          label={t('Disconnect')}
          accent={palette.provider.ps}
          danger
          onPress={onRailDisconnect}
        />
        <View style={styles.topSpacer} />
        <RailIconButton
          icon="close"
          label={t('Close')}
          accent={palette.provider.ps}
          onPress={onCloseControlRail}
        />
      </View>

      {/* The contents scroll: on a short screen (a TV) the groups no longer
          fit, and a fixed-height rail would squeeze them together. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          <RailSectionLabel
            title={t('Input')}
            caption={caption?.section === 'input' ? caption.text : undefined}
          />
          <RailTileRow>
            <RailTile
              accent={palette.provider.ps}
              icon={
                showVirtualGamepad
                  ? 'gamepad-variant'
                  : 'gamepad-variant-outline'
              }
              label={t('Virtual gamepad')}
              active={showVirtualGamepad}
              onPress={onToggleVirtualGamepad}
              {...tileCaption('input')}
            />
            <RailTile
              accent={palette.provider.ps}
              icon="gesture-swipe"
              label={t('Touchpad')}
              active={touchpadVisible}
              onPress={onToggleTouchpad}
              {...tileCaption('input')}
            />
            <RailTile
              accent={palette.provider.ps}
              icon={vibrationEnabled ? 'vibrate' : 'vibrate-off'}
              label={t('Vibration')}
              active={vibrationEnabled}
              onPress={onToggleVibration}
              {...tileCaption('input')}
            />
          </RailTileRow>
          <RailButton
            accent={palette.provider.ps}
            icon="pencil-outline"
            label={t('Edit layout')}
            onPress={onEditGamepadLayout}
          />
        </View>

        <View style={styles.group}>
          <RailSectionLabel title={t('Audio')} />
          <RailButton
            accent={palette.provider.ps}
            icon={micOpen ? 'microphone' : 'microphone-off'}
            label={t('Microphone')}
            active={micOpen}
            onPress={onToggleMic}
          />
          <View style={styles.volumeRow}>
            <RailIconButton
              icon={audioMuted ? 'volume-off' : 'volume-high'}
              label={t('Mute')}
              accent={palette.provider.ps}
              active={audioMuted}
              onPress={onToggleMute}
            />
            <RNSlider
              style={styles.volumeTrack}
              minimumValue={0}
              maximumValue={1}
              step={0.1}
              value={audioGain}
              onValueChange={setLiveVolume}
              onSlidingComplete={onAudioGainChange}
              minimumTrackTintColor={
                audioMuted ? palette.textDim : palette.provider.ps
              }
              maximumTrackTintColor={alpha(palette.white, 0.14)}
              thumbTintColor={
                audioMuted ? palette.textDim : palette.provider.ps
              }
            />
            <Text style={styles.volumeValue}>{liveVolume.toFixed(1)}x</Text>
          </View>
        </View>

        <View style={styles.group}>
          <RailSectionLabel
            title={t('Display')}
            caption={caption?.section === 'display' ? caption.text : undefined}
          />
          <RailTileRow>
            <RailTile
              accent={palette.provider.ps}
              icon="chart-line"
              label={t('Perf stats')}
              active={performanceVisible}
              onPress={onTogglePerformance}
              {...tileCaption('display')}
            />
            {coverAvailable && (
              <RailTile
                accent={palette.provider.ps}
                icon="image-outline"
                label={t('Cover controls')}
                active={coverPresented}
                onPress={onToggleCoverControls}
                {...tileCaption('display')}
              />
            )}
          </RailTileRow>
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
        </View>
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
  metrics: {
    paddingHorizontal: 4,
    gap: 2,
  },
  metricLine: {fontSize: 11, color: palette.textSoft},
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

export default PsPlusControlRail;
