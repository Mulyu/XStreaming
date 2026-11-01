import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {alpha, palette} from '../config/palette';

// One line of "where can I play it": a coloured dot and a sentence, drawn dim
// when the title is not playable there.
export type SpotlightLine = {color: string; text: string; on: boolean};

type Props = {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  lines?: SpotlightLine[];
  // Plain note replacing the lines (e.g. "Not streamable").
  note?: string;
  price?: string;
  originalPrice?: string;
  sale?: string;
  hint?: string;
};

// The big "currently selected title" panel at the top of a TV shelf screen:
// text on the left, cover art on the right. Not focusable itself; a screen
// updates it from its cards' focus.
const TitleSpotlight: React.FC<Props> = ({
  title,
  subtitle,
  imageUrl,
  lines,
  note,
  price,
  originalPrice,
  sale,
  hint,
}) => (
  <View style={styles.root}>
    <View style={styles.text}>
      {!!title && (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      )}
      {!!subtitle && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      {!!note && <Text style={styles.line}>{note}</Text>}
      {!!lines?.length && (
        <View style={styles.lines}>
          {lines.map(line => (
            <View key={line.text} style={styles.lineRow}>
              <View
                style={[
                  styles.dot,
                  {backgroundColor: line.color, opacity: line.on ? 1 : 0.35},
                ]}
              />
              <Text
                style={[styles.line, !line.on && styles.lineOff]}
                numberOfLines={1}>
                {line.text}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!!price && (
        <View style={styles.priceRow}>
          {!!sale && <Text style={styles.sale}>{sale}</Text>}
          {!!originalPrice && (
            <Text style={styles.original}>{originalPrice}</Text>
          )}
          <Text style={styles.price}>{price}</Text>
        </View>
      )}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
    <View style={styles.art}>
      {imageUrl ? (
        <Image
          source={{uri: imageUrl}}
          resizeMode="cover"
          style={styles.image}
        />
      ) : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    height: 132,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
  text: {flex: 1, paddingHorizontal: 16, paddingVertical: 10, gap: 3},
  title: {fontSize: 20, fontWeight: '800'},
  subtitle: {fontSize: 12, color: palette.textSoft},
  lines: {gap: 2},
  lineRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
  line: {fontSize: 12, color: palette.text},
  lineOff: {color: palette.textDim},
  priceRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sale: {fontSize: 12, fontWeight: '800', color: palette.sale},
  original: {
    fontSize: 12,
    color: palette.textDim,
    textDecorationLine: 'line-through',
  },
  price: {fontSize: 13, fontWeight: '700', color: palette.text},
  hint: {fontSize: 11, color: palette.textDim},
  art: {
    width: '38%',
    backgroundColor: alpha(palette.surfaceHigh, 0.6),
  },
  image: {width: '100%', height: '100%'},
});

export default TitleSpotlight;
