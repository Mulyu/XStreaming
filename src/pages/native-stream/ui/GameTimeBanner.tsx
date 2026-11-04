import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Icon, Text} from 'react-native-paper';
import {alpha, palette} from '../../../shared/config/palette';

// A short notice over the stream that the cloud gaming time is nearly used up.
// It takes no touches, so the game stays playable underneath.
const GameTimeBanner = ({message}: {message: string}) => (
  <View style={styles.wrap} pointerEvents="none">
    <View style={styles.banner}>
      <Icon source="timer-sand" size={20} color={palette.warning} />
      <Text style={styles.text}>{message}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: alpha(palette.black, 0.82),
    borderWidth: 1,
    borderColor: alpha(palette.warning, 0.6),
  },
  text: {fontSize: 14, fontWeight: '700', color: palette.text},
});

export default GameTimeBanner;
