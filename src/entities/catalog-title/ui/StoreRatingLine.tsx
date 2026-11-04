import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Icon, Text} from 'react-native-paper';
import {palette} from '../../../shared/config/palette';
import type {StoreRating} from '../model/storeRating';

// A review verdict's colour: Steam's own convention (blue / amber / red).
const SENTIMENT_COLOR = {
  positive: palette.info,
  mixed: palette.warning,
  negative: palette.sale,
} as const;

// "★ 4.3 (1,204)" for a star rating, "非常に好評 (12,345)" for a review
// verdict. The count is left out where the store doesn't give one. `source`
// names the store in front of a verdict when the screen shows more than one.
export const StoreRatingLine = ({
  rating,
  source,
}: {
  rating: StoreRating;
  source?: string;
}) => {
  const count = rating.count ? (
    <Text style={styles.count}>({rating.count.toLocaleString()})</Text>
  ) : null;
  if (rating.kind === 'stars') {
    return (
      <View style={styles.row}>
        {!!source && <Text style={styles.source}>{source}</Text>}
        <Icon source="star" size={13} color={palette.warning} />
        <Text style={styles.num}>{rating.average.toFixed(1)}</Text>
        {count}
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {!!source && <Text style={styles.source}>{source}</Text>}
      <Text
        style={[styles.verdict, {color: SENTIMENT_COLOR[rating.sentiment]}]}
        numberOfLines={1}>
        {rating.label}
      </Text>
      {count}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 4},
  source: {fontSize: 11, fontWeight: '700', color: palette.textDim},
  num: {fontSize: 12, fontWeight: '700', color: palette.text},
  count: {fontSize: 11, color: palette.textDim},
  verdict: {fontSize: 12, fontWeight: '700', flexShrink: 1},
});
