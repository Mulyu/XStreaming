import React from 'react';
import {View, StyleSheet, TextInput} from 'react-native';
import {Text, Button, ActivityIndicator} from 'react-native-paper';
import {PsPlusStreamView as NativePsPlusStreamView} from '../../../features/ps-plus-session';
import {VirtualGamepad} from '../../../entities/gamepad';
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
}) => {
  return (
    <View style={styles.container}>
      <NativePsPlusStreamView style={styles.video} />

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

      {connectState === 'connected' && (
        <VirtualGamepad
          opacity={0.7}
          joystickMode={1}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onStickMove={onStickMove}
        />
      )}

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
