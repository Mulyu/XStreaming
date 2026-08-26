import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import {Button, Card, Text, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation} from '@react-navigation/native';

const {CoverDisplayManager} = NativeModules;

// Proof-of-concept for showing separate RN content on a foldable's cover
// display via Jetpack WindowManager Dual Screen Mode (present-on-area).
function CoverDisplayPocScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [status, setStatus] = React.useState('—');
  const [sessionEvent, setSessionEvent] = React.useState('—');

  const refreshStatus = React.useCallback(async () => {
    if (!CoverDisplayManager?.getStatus) {
      setStatus('MODULE_MISSING');
      return;
    }
    try {
      setStatus(await CoverDisplayManager.getStatus());
    } catch (e: any) {
      setStatus('ERROR: ' + (e?.message ?? e));
    }
  }, []);

  React.useEffect(() => {
    refreshStatus();
    const sub = DeviceEventEmitter.addListener('CoverDisplayEvent', ev => {
      setSessionEvent(String(ev));
      refreshStatus();
    });
    return () => sub.remove();
  }, [refreshStatus]);

  const present = async () => {
    try {
      await CoverDisplayManager.present('XCoverScreen');
    } catch (e: any) {
      setSessionEvent('present error: ' + (e?.message ?? e));
    }
    refreshStatus();
  };

  const dismiss = () => {
    CoverDisplayManager?.dismiss?.();
    setTimeout(refreshStatus, 300);
  };

  const available = status === 'AVAILABLE' || status === 'ACTIVE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">{t('CoverDisplayTitle')}</Text>
          <Text style={styles.desc}>{t('CoverDisplayDesc')}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.row}>
            <Text>{t('Status')}</Text>
            <Text style={[styles.status, {color: theme.colors.primary}]}>
              {status}
            </Text>
          </View>
          <View style={styles.row}>
            <Text>{t('Session')}</Text>
            <Text style={styles.event}>{sessionEvent}</Text>
          </View>
        </Card.Content>
      </Card>

      <Button mode="outlined" style={styles.btn} onPress={refreshStatus}>
        {t('Refresh status')}
      </Button>
      <Button
        mode="contained"
        style={styles.btn}
        disabled={!available}
        onPress={present}>
        {t('Present on cover')}
      </Button>
      <Button mode="text" style={styles.btn} onPress={dismiss}>
        {t('Dismiss')}
      </Button>

      <Button
        mode="outlined"
        style={styles.btn}
        disabled={!available}
        onPress={() => navigation.navigate('CoverLayoutEditor')}>
        {t('Edit cover buttons')}
      </Button>

      {!available && (
        <Text style={styles.note}>{t('CoverDisplayUnavailableNote')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {padding: 16},
  card: {marginBottom: 14},
  desc: {marginTop: 8, opacity: 0.8, lineHeight: 20},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  status: {fontWeight: '700'},
  event: {opacity: 0.7},
  btn: {marginTop: 10},
  note: {marginTop: 16, opacity: 0.7, lineHeight: 20},
});

export default CoverDisplayPocScreen;
