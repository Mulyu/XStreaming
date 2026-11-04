import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Icon, Text} from 'react-native-paper';
import {StoreRating} from '../../../entities/catalog-title';
import {alpha, palette} from '../../../shared/config/palette';

// A review verdict's colour: Steam's own convention (blue / amber / red).
const SENTIMENT_COLOR = {
  positive: palette.info,
  mixed: palette.warning,
  negative: palette.sale,
} as const;

export const formatRatingCount = (count: number): string =>
  count.toLocaleString();

// "★ 4.3 (1,204)" for a star rating, "非常に好評 (12,345)" for a review
// verdict. The count is left out where the store list doesn't give one.
export const RatingLine = ({rating}: {rating: StoreRating}) => {
  if (rating.kind === 'stars') {
    return (
      <View style={styles.ratingRow}>
        <Icon source="star" size={13} color={palette.warning} />
        <Text style={styles.ratingNum}>{rating.average.toFixed(1)}</Text>
        {!!rating.count && (
          <Text style={styles.ratingCount}>
            ({formatRatingCount(rating.count)})
          </Text>
        )}
      </View>
    );
  }
  return (
    <View style={styles.ratingRow}>
      <Text
        style={[styles.verdict, {color: SENTIMENT_COLOR[rating.sentiment]}]}
        numberOfLines={1}>
        {rating.label}
      </Text>
      {!!rating.count && (
        <Text style={styles.ratingCount}>
          ({formatRatingCount(rating.count)})
        </Text>
      )}
    </View>
  );
};

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
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
  ratingNum: {fontSize: 12, fontWeight: '700', color: palette.text},
  ratingCount: {fontSize: 11, color: palette.textDim},
  verdict: {fontSize: 12, fontWeight: '700', flexShrink: 1},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  chip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: alpha(palette.text, 0.12),
  },
  chipText: {fontSize: 10.5, color: palette.textSoft},
});
