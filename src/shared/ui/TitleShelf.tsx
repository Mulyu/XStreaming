import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {palette} from '../config/palette';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

// A titled horizontal row of cards. On TV the D-pad moves between the cards
// (Android's own focus search scrolls the row to the focused one).
const TitleShelf: React.FC<Props> = ({title, subtitle, children}) => (
  <View style={styles.shelf}>
    <View style={styles.head}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  shelf: {gap: 4},
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 4,
  },
  title: {fontSize: 15, fontWeight: '800'},
  subtitle: {fontSize: 11, color: palette.textDim},
  row: {flexDirection: 'row'},
});

export default TitleShelf;
