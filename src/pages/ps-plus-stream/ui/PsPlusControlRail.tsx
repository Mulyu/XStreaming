import React from 'react';
import {View, StyleSheet, Pressable} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';

const PS_ACCENT = '#0070D1';

// PS Plus's own scaled-down equivalent of native-stream's StreamControlRail:
// only the options that actually apply to a PS5 cloud session (no mouse/
// keyboard/mic/FSR/video-format/cover-PiP -- none of those have a PS Plus
// counterpart) -- edit the shared on-screen gamepad profile, toggle
// vibration, a live performance readout, and disconnect.
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
  | 'onEditGamepadLayout'
  | 'onRailDisconnect'
>;

const RailButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({icon, label, onPress, active, danger}) => (
  <Pressable
    style={[styles.railBtn, active && styles.railBtnActive]}
    onPress={onPress}
    android_ripple={{color: 'rgba(255,255,255,0.15)'}}>
    <Icon
      source={icon}
      size={18}
      color={danger ? '#ff5347' : active ? PS_ACCENT : '#8a9a92'}
    />
    <Text style={[styles.railBtnLabel, danger && styles.railBtnLabelDanger]}>
      {label}
    </Text>
  </Pressable>
);

const PsPlusControlRail: React.FC<Props> = ({
  t,
  showControlRail,
  onCloseControlRail,
  vibrationEnabled,
  onToggleVibration,
  performanceVisible,
  onTogglePerformance,
  metrics,
  onEditGamepadLayout,
  onRailDisconnect,
}) => {
  if (!showControlRail) {
    return null;
  }
  return (
    <View style={styles.rail}>
      <Pressable style={styles.closeBtn} onPress={onCloseControlRail}>
        <Icon source="close" size={16} color="#8a9a92" />
      </Pressable>

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

      <View style={styles.spacer} />

      <RailButton
        icon="close-circle-outline"
        label={t('Disconnect')}
        danger
        onPress={onRailDisconnect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 220,
    backgroundColor: 'rgba(10,12,14,0.94)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(140,140,150,0.24)',
    paddingTop: 44,
    paddingHorizontal: 10,
    gap: 6,
  },
  closeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 6,
  },
  railBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  railBtnActive: {backgroundColor: 'rgba(0,112,209,0.16)'},
  railBtnLabel: {fontSize: 13, fontWeight: '600', color: '#fff'},
  railBtnLabelDanger: {color: '#ff5347'},
  metrics: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  metricLine: {fontSize: 11, color: '#8a9a92'},
  spacer: {flex: 1},
});

export default PsPlusControlRail;
