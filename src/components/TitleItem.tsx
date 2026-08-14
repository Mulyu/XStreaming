import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {PriceInfo, formatPrice, discountPercent} from '../utils/storePrice';

type Props = {
  titleItem: any;
  onPress: (titleItem: any) => any;
  onLongPress?: (titleItem: any) => any;
  isFavorite?: boolean;
  price?: PriceInfo | null;
  compact?: boolean;
};

const TitleItem: React.FC<Props> = ({
  titleItem,
  onPress,
  onLongPress,
  isFavorite = false,
  price = null,
  compact = false,
}) => {
  const theme = useTheme();
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(true);

  // Playable now: the user is entitled to this title (Game Pass / XGPU library).
  const isPlayable = titleItem?.details?.hasEntitlement === true;
  const hasImage = !!(titleItem?.Image_Tile || titleItem?.Image_Poster);
  const onSale = !!price?.onSale;
  const off = price ? discountPercent(price) : 0;

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
          {hasImage && isPlayable && (
            <View style={[styles.badge, compact && styles.badgeCompact]}>
              <Text
                style={[styles.badgeText, compact && styles.badgeTextCompact]}>
                ✓
              </Text>
            </View>
          )}
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
          {hasImage && onSale && off > 0 && (
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

          {(isPlayable || price) && (
            <View style={styles.priceRow}>
              {isPlayable && (
                <Text style={[styles.gpTag, compact && styles.gpTagCompact]}>
                  {t('Game Pass')}
                </Text>
              )}
              {price && (
                <>
                  <Text
                    style={[
                      styles.price,
                      compact && styles.priceCompact,
                      onSale && styles.priceSale,
                    ]}>
                    {formatPrice(price.listPrice, price.currencyCode)}
                  </Text>
                  {onSale && (
                    <Text style={[styles.msrp, compact && styles.msrpCompact]}>
                      {formatPrice(price.msrp, price.currencyCode)}
                    </Text>
                  )}
                </>
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
  gpTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#107C10',
    backgroundColor: 'rgba(16, 124, 16, 0.12)',
    borderColor: 'rgba(16, 124, 16, 0.30)',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
    overflow: 'hidden',
  },
  gpTagCompact: {
    fontSize: 9,
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
