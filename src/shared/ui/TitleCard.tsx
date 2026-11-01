import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {TV_FOCUS_COLOR, useTVFocus} from './tvFocus';
import {alpha, palette} from '../config/palette';

// One service badge on a card: a coloured letter chip when the title is
// playable there, a grey one when the service merely lists it. `catalog` adds
// the small gift mark ("included in the subscription").
export type CardBadge = {
  letter: string;
  color: string;
  on: boolean;
  catalog?: boolean;
};

type Props = {
  // Outer width. The cover is a square inside the card's padding.
  width: number;
  title: string;
  imageUrl?: string;
  badges?: CardBadge[];
  // "-30%" pill. Sits top-left, or top-right when a rank number is shown.
  sale?: string;
  price?: string;
  // Big rank number over the cover's top-left (store charts).
  rank?: number;
  // Greyed out (nothing to launch).
  dim?: boolean;
  // Small label on the cover's top-right, e.g. "Not streamable".
  tag?: string;
  onPress: () => void;
  onLongPress?: () => void;
  // The card gained / lost the TV focus (e.g. to update a spotlight).
  onFocusItem?: () => void;
};

// A cover-art card for shelves and grids. On TV the focusable thing is the
// whole padded card, deliberately much bigger than the cover, so Android's
// default focus highlight and our ring have plain mat to show on; the 2px
// border is always there (transparent when idle) so gaining the ring never
// resizes the card.
const PAD = 8;
const BORDER = 2;

const TitleCard = React.memo(function TitleCard({
  width,
  title,
  imageUrl,
  badges,
  sale,
  price,
  rank,
  dim,
  tag,
  onPress,
  onLongPress,
  onFocusItem,
}: Props) {
  const focus = useTVFocus();
  const cover = Math.max(40, width - 2 * (PAD + BORDER));
  return (
    <Pressable
      style={[styles.card, {width}, focus.focused && styles.cardFocused]}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => {
        focus.onFocus();
        onFocusItem?.();
      }}
      onBlur={focus.onBlur}
      accessibilityLabel={title}
      android_ripple={{color: alpha(palette.text, 0.15)}}>
      <View style={[styles.cover, {width: cover, height: cover}]}>
        {imageUrl ? (
          <Image
            source={{uri: imageUrl}}
            resizeMode="cover"
            style={styles.fill}
          />
        ) : (
          <View style={[styles.fill, styles.placeholder]}>
            <Text style={styles.placeholderText} numberOfLines={3}>
              {title}
            </Text>
          </View>
        )}
        {dim && <View style={styles.dim} pointerEvents="none" />}
        <View style={styles.scrim} pointerEvents="none" />
        {rank !== undefined && <Text style={styles.rank}>{rank}</Text>}
        {!!sale && (
          <View style={[styles.sale, rank !== undefined && styles.saleRight]}>
            <Text style={styles.saleText}>{sale}</Text>
          </View>
        )}
        {!!tag && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        )}
        {!!badges?.length && (
          <View style={styles.badges}>
            {badges.map(badge => (
              <View key={badge.letter} style={styles.badgeGroup}>
                <View
                  style={[
                    styles.badge,
                    {backgroundColor: badge.on ? badge.color : DIM_BG},
                  ]}>
                  <Text
                    style={[
                      styles.badgeText,
                      !badge.on && {color: palette.textSoft},
                    ]}>
                    {badge.letter}
                  </Text>
                </View>
                {badge.catalog && (
                  <View style={[styles.mark, {backgroundColor: badge.color}]}>
                    <Icon
                      source="gift-outline"
                      size={11}
                      color={palette.white}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        {!!price && (
          <View style={styles.price}>
            <Text style={styles.priceText}>{price}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.title, dim && styles.titleDim]} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
});

const DIM_BG = alpha(palette.text, 0.3);

const styles = StyleSheet.create({
  card: {
    padding: PAD,
    borderRadius: 18,
    borderWidth: BORDER,
    borderColor: 'transparent',
  },
  cardFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: alpha(palette.focusRing, 0.12),
  },
  cover: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: palette.surfaceHigh,
  },
  fill: {width: '100%', height: '100%'},
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: palette.surfaceHigh,
  },
  placeholderText: {
    fontSize: 12,
    color: palette.textSoft,
    textAlign: 'center',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(palette.bg, 0.55),
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
    backgroundColor: alpha(palette.scrim, 0.45),
  },
  rank: {
    position: 'absolute',
    left: 6,
    top: 0,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: palette.white,
    textShadowColor: alpha(palette.black, 0.7),
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  sale: {
    position: 'absolute',
    left: 6,
    top: 6,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: palette.sale,
  },
  saleRight: {left: undefined, right: 6},
  saleText: {fontSize: 11, fontWeight: '800', color: palette.onAccent},
  tag: {
    position: 'absolute',
    right: 6,
    top: 6,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: alpha(palette.scrim, 0.8),
  },
  tagText: {fontSize: 10, color: palette.textSoft},
  badges: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    gap: 4,
  },
  badgeGroup: {flexDirection: 'row', alignItems: 'center', gap: 2},
  badge: {
    height: 17,
    paddingHorizontal: 5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {fontSize: 10, fontWeight: '800', color: palette.onAccent},
  mark: {
    width: 15,
    height: 15,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: alpha(palette.scrim, 0.78),
  },
  priceText: {fontSize: 11, fontWeight: '700', color: palette.text},
  title: {
    marginTop: 6,
    marginHorizontal: 2,
    minHeight: 32,
    fontSize: 12.5,
    lineHeight: 16,
    color: palette.text,
  },
  titleDim: {color: palette.textSoft},
});

export default TitleCard;
