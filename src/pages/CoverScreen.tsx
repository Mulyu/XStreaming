import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

// Rendered on the foldable cover (outer) display via the WindowAreaController
// present-mode PoC. It runs on the app's single JS context, so it shares the
// same runtime/state as the main screen — here we just show a live clock to
// prove JS is executing on the cover surface.
export default function CoverScreen() {
  const [now, setNow] = React.useState(() => new Date().toLocaleTimeString());
  React.useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>XStreaming</Text>
      <Text style={styles.title}>Cover display</Text>
      <Text style={styles.clock}>{now}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0E1512',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  brand: {
    color: '#2FD24B',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#E6ECE8',
    fontSize: 14,
    marginTop: 4,
  },
  clock: {
    color: '#8A9A92',
    fontSize: 28,
    marginTop: 18,
    fontVariant: ['tabular-nums'],
  },
});
