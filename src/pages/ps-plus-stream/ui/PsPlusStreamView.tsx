import React from 'react';
import {View, StyleSheet, TextInput, useWindowDimensions} from 'react-native';
import {Text, Button} from 'react-native-paper';
import {PsPlusStreamView as NativePsPlusStreamView} from '../../../features/ps-plus-session';
import {VirtualGamepad} from '../../../entities/gamepad';
import {CustomVirtualGamepad} from '../../../features/controller-customization';
import {VirtualGamepadEditor} from '../../../widgets/virtual-gamepad-editor';
import PsPlusControlRail from './PsPlusControlRail';
import type {PsPlusStreamViewModel} from '../model/usePsPlusStream';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';
import StreamHandshakeOverlay from '../../../shared/ui/StreamHandshakeOverlay';

type Props = PsPlusStreamViewModel;

const PsPlusStreamScreenView: React.FC<Props> = ({
  t,
  title,
  posterUrl,
  connectState,
  progressText,
  loadingPhase,
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
  onCloseControlRail,
  showVirtualGamepad,
  onToggleVirtualGamepad,
  vibrationEnabled,
  onToggleVibration,
  performanceVisible,
  onTogglePerformance,
  metrics,
  screenPosition,
  videoFormat,
  audioGain,
  onAudioGainChange,
  onSetScreenPosition,
  onCycleVideoFormat,
  onEditGamepadLayout,
  showGamepadEditor,
  editorProfile,
  gamepadProfiles,
  editorSwipeConfig,
  editorSensorConfig,
  onSaveGamepadLayout,
  onCancelGamepadEditor,
  onSwitchGamepadProfile,
  onCreateGamepadProfile,
  onDeleteGamepadProfile,
  gamepadLayoutVersion,
  swipeAimEnabled,
  swipeAimSensitivity,
  swipeAimAcceleration,
  swipeAimRect,
  onSwipeAim,
  onSwipeAimEnd,
  swipeAimIsActive,
  coverAvailable,
  coverPresented,
  onToggleCoverControls,
  onRailDisconnect,
}) => {
  const failedCloseFocus = useTVFocus();
  const closedCloseFocus = useTVFocus();
  const confirmPinFocus = useTVFocus();
  // See PsPlusControlRail's own screenHeight prop comment -- an explicit
  // height instead of relying on `top: 0` + `bottom: 0` to resolve against
  // this screen's root container.
  const {height: screenHeight} = useWindowDimensions();

  const swipeAimProps = {
    swipeAimEnabled,
    swipeAimSensitivity,
    swipeAimAcceleration,
    swipeAimRect,
    onSwipeAim,
    onSwipeAimEnd,
    swipeAimIsActive,
  };
  return (
    <View style={styles.container}>
      <NativePsPlusStreamView
        style={styles.video}
        screenPosition={screenPosition}
        videoFormat={videoFormat}
      />

      {connectState === 'connecting' && (
        <StreamHandshakeOverlay
          streamType="psplus"
          gameTitle={title}
          posterUrl={posterUrl || undefined}
          phase={loadingPhase}
          detailText={progressText}
          onCancel={onRequestExit}
        />
      )}

      {(connectState === 'failed' || connectState === 'closed') && (
        <View style={styles.overlay}>
          {connectState === 'failed' && (
            <>
              <Text style={styles.overlayText}>{t('Failed to connect')}</Text>
              {!!errorDetail && (
                <Text style={styles.overlaySubText}>{errorDetail}</Text>
              )}
              <Button
                mode="contained"
                onPress={onRequestExit}
                onFocus={failedCloseFocus.onFocus}
                onBlur={failedCloseFocus.onBlur}
                style={failedCloseFocus.focused && tvFocusRing}>
                {t('Close')}
              </Button>
            </>
          )}
          {connectState === 'closed' && (
            <>
              <Text style={styles.overlayText}>{t('Stream ended')}</Text>
              <Button
                mode="contained"
                onPress={onRequestExit}
                onFocus={closedCloseFocus.onFocus}
                onBlur={closedCloseFocus.onBlur}
                style={closedCloseFocus.focused && tvFocusRing}>
                {t('Close')}
              </Button>
            </>
          )}
        </View>
      )}

      {connectState === 'connected' &&
        !showControlRail &&
        showVirtualGamepad &&
        (activeProfile ? (
          <CustomVirtualGamepad
            title={activeProfile}
            opacity={0.7}
            joystickMode={joystickMode}
            refreshKey={gamepadLayoutVersion}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onStickMove={onStickMove}
            {...swipeAimProps}
          />
        ) : (
          <VirtualGamepad
            opacity={0.7}
            joystickMode={joystickMode}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onStickMove={onStickMove}
            {...swipeAimProps}
          />
        ))}

      <PsPlusControlRail
        t={t}
        screenHeight={screenHeight}
        showControlRail={showControlRail}
        onCloseControlRail={onCloseControlRail}
        vibrationEnabled={vibrationEnabled}
        onToggleVibration={onToggleVibration}
        performanceVisible={performanceVisible}
        onTogglePerformance={onTogglePerformance}
        metrics={metrics}
        screenPosition={screenPosition}
        onSetScreenPosition={onSetScreenPosition}
        videoFormat={videoFormat}
        onCycleVideoFormat={onCycleVideoFormat}
        audioGain={audioGain}
        onAudioGainChange={onAudioGainChange}
        onEditGamepadLayout={onEditGamepadLayout}
        showVirtualGamepad={showVirtualGamepad}
        onToggleVirtualGamepad={onToggleVirtualGamepad}
        coverAvailable={coverAvailable}
        coverPresented={coverPresented}
        onToggleCoverControls={onToggleCoverControls}
        onRailDisconnect={onRailDisconnect}
      />

      <VirtualGamepadEditor
        visible={showGamepadEditor}
        profileName={editorProfile || activeProfile}
        profiles={gamepadProfiles}
        activeProfile={activeProfile}
        swipeSensitivity={editorSwipeConfig.sensitivity}
        swipeInvertY={editorSwipeConfig.invertY}
        swipeActivation={editorSwipeConfig.activation}
        swipeAcceleration={editorSwipeConfig.acceleration}
        joystickMode={joystickMode}
        sensorConfig={editorSensorConfig}
        onSave={onSaveGamepadLayout}
        onCancel={onCancelGamepadEditor}
        onSwitchProfile={onSwitchGamepadProfile}
        onCreateProfile={onCreateGamepadProfile}
        onDeleteProfile={onDeleteGamepadProfile}
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
          <Button
            mode="contained"
            onPress={onSubmitPin}
            onFocus={confirmPinFocus.onFocus}
            onBlur={confirmPinFocus.onBlur}
            style={confirmPinFocus.focused && tvFocusRing}>
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
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
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
