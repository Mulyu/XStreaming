import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useTranslation} from 'react-i18next';
import {PriceInfo, formatPrice, discountPercent} from '../utils/storePrice';

type Props = {
  titleItem: any;
  onPress: (titleItem: any) => any;
  onLongPress?: (titleItem: any) => any;
  isFavorite?: boolean;
  isLeavingSoon?: boolean;
  price?: PriceInfo | null;
  compact?: boolean;
};

const TitleItem: React.FC<Props> = ({
  titleItem,
  onPress,
  onLongPress,
  isFavorite = false,
  isLeavingSoon = false,
  price = null,
  compact = false,
}) => {
  const theme = useTheme();
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(true);

  // Playable now: the user is entitled to this title (Game Pass / XGPU library).
  const isPlayable = titleItem?.details?.hasEntitlement === true;
  const hasImage = !!(titleItem?.Image_Tile || titleItem?.Image_Poster);
  const off = price ? discountPercent(price) : 0;
  // Only treat it as "on sale" for display when the discount is at least 1%,
  // so a price that rounds to 0% off doesn't show a near-identical struck price.
  const showSale = !!price?.onSale && off > 0;

  const handlePress = () => {
    onPress && onPress(titleItem);
  };

  const handleLongPress = () => {
    onLongPress && onLongPress(titleItem);
  };

  const renderImage = () => {
    if (!titleItem) {
      return null;
    }
    if (!titleItem.Image_Tile && !titleItem.Image_Poster) {
      return null;
    }
    const url = titleItem.Image_Tile
      ? titleItem.Image_Tile.URL
      : titleItem.Image_Poster.URL;

    if (url) {
      return (
        <Image
          source={{
            uri: 'https:' + url,
          }}
          resizeMode={'cover'}
          onLoad={() => setLoading(false)}
          style={[styles.image, compact && styles.imageCompact]}
        />
      );
    } else {
      return null;
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={300}
      android_ripple={{color: 'rgba(255,255,255,0.18)'}}
      style={styles.pressable}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator
              size={compact ? 'small' : 'large'}
              color={theme.colors.primary}
            />
          </View>
        )}
        <View>
          {renderImage()}
          {/* Leaving soon takes the playable-badge slot: a title about to leave
              Game Pass is more urgent to surface than "you can play it". */}
          {hasImage && isLeavingSoon ? (
            <View
              style={[styles.leavingBadge, compact && styles.badgeCompact]}
              accessibilityLabel={t('Leaving soon')}>
              <Ionicons name="time" size={compact ? 12 : 14} color="#1a1205" />
            </View>
          ) : hasImage && isPlayable ? (
            <View style={[styles.badge, compact && styles.badgeCompact]}>
              <Text
                style={[styles.badgeText, compact && styles.badgeTextCompact]}>
                ✓
              </Text>
            </View>
          ) : null}
          {hasImage && isFavorite && (
            <View
              style={[
                styles.favoriteBadge,
                compact && styles.favoriteBadgeCompact,
              ]}>
              <Text
                style={[
                  styles.favoriteIcon,
                  compact && styles.favoriteIconCompact,
                ]}>
                ♥
              </Text>
            </View>
          )}
          {hasImage && showSale && (
            <View style={[styles.ribbon, compact && styles.ribbonCompact]}>
              <Text
                style={[
                  styles.ribbonText,
                  compact && styles.ribbonTextCompact,
                ]}>
                -{off}%
              </Text>
            </View>
          )}
        </View>
        <View
          style={[
            styles.descriptionContainer,
            compact && styles.descriptionContainerCompact,
          ]}>
          <Text
            style={[styles.description, compact && styles.descriptionCompact]}
            numberOfLines={compact ? 1 : 2}
            ellipsizeMode="tail">
            {titleItem.ProductTitle}
          </Text>

          {price && (
            <View style={styles.priceRow}>
              <Text
                style={[
                  styles.price,
                  compact && styles.priceCompact,
                  showSale && styles.priceSale,
                ]}>
                {formatPrice(price.listPrice, price.currencyCode)}
              </Text>
              {showSale && (
                <Text style={[styles.msrp, compact && styles.msrpCompact]}>
                  {formatPrice(price.msrp, price.currencyCode)}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(140, 140, 150, 0.38)',
    borderRadius: 8,
    margin: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardCompact: {
    margin: 5,
    borderColor: 'rgba(140, 140, 150, 0.28)',
  },
  loadingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: 150,
  },
  imageCompact: {
    height: 104,
  },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#107C10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    left: 4,
    bottom: 4,
    width: 17,
    height: 17,
    borderRadius: 9,
  },
  leavingBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff9d1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  badgeTextCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  favoriteBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteBadgeCompact: {
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  favoriteIcon: {
    color: '#ff4d6d',
    fontSize: 14,
    lineHeight: 16,
    textAlign: 'center',
  },
  favoriteIconCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  ribbon: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#e5342b',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ribbonCompact: {
    top: 4,
    right: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
  },
  ribbonText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  ribbonTextCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  descriptionContainer: {
    padding: 10,
  },
  descriptionContainerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  description: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0,
  },
  descriptionCompact: {
    fontSize: 11,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  price: {
    fontSize: 12.5,
    fontWeight: '800',
    marginRight: 6,
  },
  priceCompact: {
    fontSize: 11,
  },
  priceSale: {
    color: '#e5342b',
  },
  msrp: {
    fontSize: 11,
    color: '#9096a8',
    textDecorationLine: 'line-through',
  },
  msrpCompact: {
    fontSize: 10,
  },
});

export default TitleItem;
