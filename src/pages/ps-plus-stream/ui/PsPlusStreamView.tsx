import React from 'react';
import {View, StyleSheet, TextInput, Pressable} from 'react-native';
import {Text, Button, Icon, ActivityIndicator} from 'react-native-paper';
import {PsPlusStreamView as NativePsPlusStreamView} from '../../../features/ps-plus-session';
import {VirtualGamepad} from '../../../entities/gamepad';
import {CustomVirtualGamepad} from '../../../features/controller-customization';
import PsPlusControlRail from './PsPlusControlRail';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';

type Props = PsPlusStreamViewModel;

const PsPlusStreamScreenView: React.FC<Props> = ({
  t,
  title,
  connectState,
  progressText,
  errorDetail,
  pinRequest,
  pin,
  onChangePin,
  onSubmitPin,
  onPressIn,
  onPressOut,
  onStickMove,
  onRequestExit,
  activeProfile,
  joystickMode,
  showControlRail,
  onOpenControlRail,
  onCloseControlRail,
  vibrationEnabled,
  onToggleVibration,
  performanceVisible,
  onTogglePerformance,
  metrics,
  debugMetrics,
  onEditGamepadLayout,
  onRailDisconnect,
}) => {
  return (
    <View style={styles.container}>
      <NativePsPlusStreamView style={styles.video} />

      {connectState === 'connected' && (
        <View pointerEvents="none" style={styles.debugBadge}>
          <Text style={styles.debugText}>
            {debugMetrics
              ? `DEBUG ${debugMetrics.width}x${
                  debugMetrics.height
                } @ ${Math.round(
                  debugMetrics.fps,
                )}fps · ${debugMetrics.bitrateMbps.toFixed(1)}Mbps · ${
                  debugMetrics.rttMs
                }ms`
              : 'DEBUG: no metrics yet'}
          </Text>
          {debugMetrics && (
            <Text style={styles.debugText}>
              {`decoder in=${debugMetrics.decoderSamplesIn} out=${debugMetrics.decoderBuffersOut} rendered=${debugMetrics.decoderBuffersRendered} configFailed=${debugMetrics.decoderConfigureFailed}`}
            </Text>
          )}
        </View>
      )}

      {connectState !== 'connected' && (
        <View style={styles.overlay}>
          {connectState === 'connecting' && (
            <>
              <ActivityIndicator size="large" />
              <Text style={styles.overlayText}>{title}</Text>
              {!!progressText && (
                <Text style={styles.overlaySubText}>{progressText}</Text>
              )}
            </>
          )}
          {connectState === 'failed' && (
            <>
              <Text style={styles.overlayText}>{t('Failed to connect')}</Text>
              {!!errorDetail && (
                <Text style={styles.overlaySubText}>{errorDetail}</Text>
              )}
              <Button mode="contained" onPress={onRequestExit}>
                {t('Close')}
              </Button>
            </>
          )}
          {connectState === 'closed' && (
            <>
              <Text style={styles.overlayText}>{t('Stream ended')}</Text>
              <Button mode="contained" onPress={onRequestExit}>
                {t('Close')}
              </Button>
            </>
          )}
        </View>
      )}

      {connectState === 'connected' && !showControlRail && (
        <>
          {activeProfile ? (
            <CustomVirtualGamepad
              title={activeProfile}
              opacity={0.7}
              joystickMode={joystickMode}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              onStickMove={onStickMove}
            />
          ) : (
            <VirtualGamepad
              opacity={0.7}
              joystickMode={joystickMode}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              onStickMove={onStickMove}
            />
          )}
          <Pressable style={styles.settingsBtn} onPress={onOpenControlRail}>
            <Icon source="cog-outline" size={18} color="#fff" />
          </Pressable>
        </>
      )}

      <PsPlusControlRail
        t={t}
        showControlRail={showControlRail}
        onCloseControlRail={onCloseControlRail}
        vibrationEnabled={vibrationEnabled}
        onToggleVibration={onToggleVibration}
        performanceVisible={performanceVisible}
        onTogglePerformance={onTogglePerformance}
        metrics={metrics}
        onEditGamepadLayout={onEditGamepadLayout}
        onRailDisconnect={onRailDisconnect}
      />

      {!!pinRequest && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>
            {pinRequest.pinIncorrect
              ? t('Incorrect PIN, try again')
              : t('Enter your PSN login PIN')}
          </Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={onChangePin}
            keyboardType="number-pad"
            autoFocus
          />
          <Button mode="contained" onPress={onSubmitPin}>
            {t('Confirm')}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // TEMPORARY debug color for the black-screen investigation -- a loud,
    // unmistakable color instead of black so we can tell apart "the
    // SurfaceView's hole-punch isn't compositing at all" (the WHOLE screen,
    // including where the video should be, shows this color) from "the
    // video area itself is genuinely black" (this color only shows around
    // the edges / behind overlay UI, with a black rectangle where the video
    // is). Revert to '#000' once the cause is found.
    backgroundColor: '#FF00FF',
  },
  settingsBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    // VirtualGamepad's own wrapping View sits at zIndex 9 (see its styles.wrap)
    // regardless of JSX order, so this needs to explicitly beat that to avoid
    // losing touches to the free analog stick's full-half-screen catcher
    // underneath it.
    zIndex: 20,
  },
  video: {
    flex: 1,
  },
  // TEMPORARY debug readout -- see the container style's own comment. Remove
  // together with it once the black-screen cause is found.
  debugBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debugText: {
    color: '#0f0',
    fontSize: 11,
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  overlaySubText: {
    color: '#ccc',
    fontSize: 13,
  },
  pinInput: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 160,
    textAlign: 'center',
  },
});

export default PsPlusStreamScreenView;
