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
import TouchpadZone from '../../../shared/ui/TouchpadZone';
import {alpha, palette} from '../../../shared/config/palette';

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
  audioMuted,
  onToggleMute,
  micOpen,
  onToggleMic,
  onSetScreenPosition,
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
  touchpadVisible,
  onTouchpadChange,
  onToggleTouchpad,
  onCloseTouchpad,
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
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  // Centered in the upper part of the screen, like the real touchpad's place
  // on the controller; wide enough for two-finger swipes.
  const touchpadWidth = Math.round(screenWidth * 0.5);
  const touchpadHeight = Math.round(screenHeight * 0.5);
  const touchpadRect = {
    x: Math.round((screenWidth - touchpadWidth) / 2),
    y: Math.round(screenHeight * 0.08),
    width: touchpadWidth,
    height: touchpadHeight,
  };

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

      {touchpadVisible && (
        <TouchpadZone
          rect={touchpadRect}
          onChange={onTouchpadChange}
          onClose={onCloseTouchpad}
          hint={t('TouchpadHint')}
        />
      )}

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
        audioGain={audioGain}
        onAudioGainChange={onAudioGainChange}
        audioMuted={audioMuted}
        onToggleMute={onToggleMute}
        micOpen={micOpen}
        onToggleMic={onToggleMic}
        onEditGamepadLayout={onEditGamepadLayout}
        showVirtualGamepad={showVirtualGamepad}
        onToggleVirtualGamepad={onToggleVirtualGamepad}
        touchpadVisible={touchpadVisible}
        onToggleTouchpad={onToggleTouchpad}
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
    backgroundColor: palette.black,
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
    backgroundColor: alpha(palette.black, 0.85),
  },
  overlayText: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '700',
  },
  overlaySubText: {
    color: palette.textSoft,
    fontSize: 13,
  },
  pinInput: {
    backgroundColor: palette.white,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 160,
    textAlign: 'center',
  },
});

export default PsPlusStreamScreenView;
