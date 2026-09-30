import React from 'react';
import {StyleSheet, ScrollView, View, ToastAndroid} from 'react-native';
import {Portal, Modal, Text, Button} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import {getLastAnrTrace, clearAnrTrace} from './anrDiagnostics';

// TEMPORARY diagnostic aid for tracking down the PS Plus streaming freeze --
// see android's AnrWatchdog.java for what captures the trace this shows.
// Mounted once at the app root (App.tsx); checks on mount (i.e. every app
// launch) for a trace left behind by a freeze in the previous run -- the
// watchdog can only write the file, it can't show anything itself since the
// whole point is the UI thread was frozen when it fired. Remove this file,
// anrDiagnostics.ts, and the render call in App.tsx (plus the native pieces
// those comment-point to) once the freeze's real cause is found, fixed, and
// confirmed on-device.
const AnrDiagnosticsOverlay: React.FC = () => {
  const [trace, setTrace] = React.useState<string | null>(null);

  React.useEffect(() => {
    getLastAnrTrace().then(t => {
      if (t) {
        setTrace(t);
      }
    });
  }, []);

  if (!trace) {
    return null;
  }

  const handleCopy = () => {
    Clipboard.setString(trace);
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  };

  const handleDismiss = () => {
    clearAnrTrace().finally(() => setTrace(null));
  };

  return (
    <Portal>
      <Modal visible dismissable={false} contentContainerStyle={styles.modal}>
        <Text style={styles.title}>Freeze detected last run</Text>
        <ScrollView style={styles.scroll}>
          <Text selectable style={styles.trace}>
            {trace}
          </Text>
        </ScrollView>
        <View style={styles.actions}>
          <Button mode="outlined" onPress={handleDismiss}>
            Dismiss
          </Button>
          <Button mode="contained" onPress={handleCopy}>
            Copy to clipboard
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    backgroundColor: '#0e1512',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    maxHeight: '85%',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
  },
  trace: {
    color: '#c8d0cc',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});

export default AnrDiagnosticsOverlay;
