import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {alpha, palette} from '../../../shared/config/palette';

// At most two genre chips -- enough to tell titles apart without crowding the
// row.
export const GenreChips = ({genres}: {genres: string[]}) => (
  <View style={styles.chips}>
    {genres.slice(0, 2).map(genre => (
      <View key={genre} style={styles.chip}>
        <Text style={styles.chipText} numberOfLines={1}>
          {genre}
        </Text>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  chip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: alpha(palette.text, 0.12),
  },
  chipText: {fontSize: 10.5, color: palette.textSoft},
});
