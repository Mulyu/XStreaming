import React from 'react';
import {StyleSheet, View, Modal, Linking, Pressable} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {GfnDeviceChallenge} from '../gfn/auth';

const NVIDIA_ACCENT = '#76B900';

type Props = {
  visible: boolean;
  status: 'starting' | 'waiting' | 'failed';
  challenge: GfnDeviceChallenge | null;
  onRetry: () => void;
  onCancel: () => void;
};

// The GFN device-code sign-in dialog: show a short code, send the user to
// nvidia's approval page, poll until they approve it. Shared by every screen
// that can trigger a GFN sign-in (Library title detail, Settings) so the
// flow only exists once.
function GfnSignInModal({
  visible,
  status,
  challenge,
  onRetry,
  onCancel,
}: Props) {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            {backgroundColor: theme.colors.elevation?.level3 || '#1b201d'},
          ]}>
          <View style={styles.modalHeader}>
            <Icon source="gamepad-variant" size={20} color={NVIDIA_ACCENT} />
            <Text style={styles.modalTitle}>{t('GfnLoginTitle')}</Text>
          </View>

          {status === 'starting' ? (
            <View style={styles.modalCentre}>
              <ActivityIndicator color={NVIDIA_ACCENT} />
            </View>
          ) : status === 'failed' ? (
            <View style={styles.modalCentre}>
              <Icon source="alert-circle-outline" size={34} color="#E06666" />
              <Text style={styles.modalMsg}>{t('GfnLoginFailed')}</Text>
              <Pressable
                onPress={onRetry}
                style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={styles.modalBtnTextPrimary}>{t('Retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.modalInstruction}>
                {t('GfnLoginInstruction')}
              </Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{challenge?.userCode}</Text>
              </View>
              <Pressable
                onPress={() =>
                  challenge &&
                  Linking.openURL(challenge.verificationUriComplete)
                }
                style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Icon source="open-in-new" size={16} color="#0B0F0C" />
                <Text style={styles.modalBtnTextPrimary}>
                  {t('GfnLoginOpen')}
                </Text>
              </Pressable>
              <View style={styles.waitingRow}>
                <ActivityIndicator size={14} color="#8A9A92" />
                <Text style={styles.waitingText}>{t('GfnLoginWaiting')}</Text>
              </View>
            </>
          )}

          <Pressable onPress={onCancel} style={styles.modalBtn}>
            <Text style={styles.modalBtnText}>{t('Cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  modalHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  modalTitle: {fontSize: 16, fontWeight: '800'},
  modalCentre: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  modalMsg: {color: '#B7C6BD', fontSize: 14, textAlign: 'center'},
  modalInstruction: {color: '#B7C6BD', fontSize: 13, lineHeight: 19},
  codeBox: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(118,185,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.4)',
  },
  codeText: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 6,
    color: '#E6ECE8',
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
  },
  modalBtnPrimary: {backgroundColor: NVIDIA_ACCENT},
  modalBtnText: {color: '#8A9A92', fontSize: 14, fontWeight: '700'},
  modalBtnTextPrimary: {color: '#0B0F0C', fontSize: 14, fontWeight: '800'},
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waitingText: {color: '#8A9A92', fontSize: 13},
});

export default GfnSignInModal;
