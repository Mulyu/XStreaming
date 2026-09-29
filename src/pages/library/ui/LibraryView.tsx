import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  Image,
  TextInput,
  Platform,
  Pressable,
} from 'react-native';
import {Text, Icon, ActivityIndicator} from 'react-native-paper';
import {
  CatalogTitle,
  isCatalogTitleOwned,
} from '../../../entities/catalog-title';
import type {LibraryScreenViewModel} from '../model/useLibraryScreen';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const PS_ACCENT = '#0070D1';
const SALE_ACCENT = '#E67E22';

type Props = LibraryScreenViewModel;

const LibraryView: React.FC<Props> = ({
  t,
  backgroundColor,
  catalog,
  filtered,
  sorted,
  keyword,
  setKeyword,
  sortMode,
  setSortMode,
  sortMenuOpen,
  setSortMenuOpen,
  filterXcloud,
  setFilterXcloud,
  filterGfn,
  setFilterGfn,
  filterPsPlus,
  setFilterPsPlus,
  filterFavorite,
  setFilterFavorite,
  filterOwnedOnly,
  setFilterOwnedOnly,
  filterOnSale,
  setFilterOnSale,
  focusedKey,
  setFocusedKey,
  gfnFullCatalogLoading,
  sortOptions,
  activeSortLabel,
  xcloudRecentPending,
  numColumns,
  refreshing,
  onRefresh,
  openTitle,
  openTitleDetail,
  saleDiscount,
}) => {
  const renderCard = ({item}: {item: CatalogTitle}) => {
    // Cover art itself grays out when the title isn't playable via any of
    // its listed services today (no Game Pass entitlement, no owned GFN
    // store variant) -- the X/N badges stay their normal color regardless,
    // since they answer "which service" rather than "playable right now".
    const isPlayable = isCatalogTitleOwned(item);
    const discount = saleDiscount(item);
    const isFocused = focusedKey === item.key;

    return (
      <View
        style={[
          styles.cell,
          {width: `${100 / numColumns}%`},
          isFocused && styles.cellFocused,
        ]}>
        <Pressable
          style={[styles.card, isFocused && styles.cardFocused]}
          onPress={() => openTitle(item)}
          onLongPress={() => openTitleDetail(item)}
          onFocus={() => setFocusedKey(item.key)}
          onBlur={() =>
            setFocusedKey(prev => (prev === item.key ? null : prev))
          }
          android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
          {item.imageUrl ? (
            <Image
              source={{uri: item.imageUrl}}
              resizeMode="cover"
              style={styles.thumb}
            />
          ) : (
            <View style={styles.thumbEmpty}>
              <Text style={styles.thumbEmptyText} numberOfLines={3}>
                {item.title}
              </Text>
            </View>
          )}

          {!isPlayable && <View style={styles.coverDim} pointerEvents="none" />}
          <View style={styles.bottomScrim} pointerEvents="none" />

          <View style={styles.availOverlay}>
            {item.xcloud && (
              <View style={[styles.availDot, {backgroundColor: XBOX_ACCENT}]}>
                <Text style={styles.availDotText}>X</Text>
              </View>
            )}
            {item.gfn && (
              <View style={[styles.availDot, {backgroundColor: NVIDIA_ACCENT}]}>
                <Text style={styles.availDotText}>N</Text>
              </View>
            )}
            {item.psplus && (
              <View style={[styles.availDot, {backgroundColor: PS_ACCENT}]}>
                <Text style={styles.availDotText}>PS</Text>
              </View>
            )}
          </View>

          {discount > 0 && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleBadgeText}>-{discount}%</Text>
            </View>
          )}

          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, {backgroundColor}]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('Library')}</Text>
          {catalog.length > 0 && (
            <Text style={styles.count}>
              {filtered.length}/{catalog.length}
            </Text>
          )}
          {gfnFullCatalogLoading && (
            <ActivityIndicator size={12} color="#8A9A92" />
          )}
        </View>
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color="#8A9A92" />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder={t('Search')}
            placeholderTextColor="#8A9A92"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.filterRow}>
          <View style={styles.chipsRow}>
            <Pressable
              style={[styles.filterChip, filterXcloud && styles.filterChipOn]}
              onPress={() => setFilterXcloud(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterXcloud && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterXcloud')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterGfn && styles.filterChipOn]}
              onPress={() => setFilterGfn(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterGfn && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterGfn')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterPsPlus && styles.filterChipOn]}
              onPress={() => setFilterPsPlus(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterPsPlus && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterPsPlus')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterFavorite && styles.filterChipOn]}
              onPress={() => setFilterFavorite(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterFavorite && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterFavorite')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.filterChip,
                filterOwnedOnly && styles.filterChipOn,
              ]}
              onPress={() => setFilterOwnedOnly(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterOwnedOnly && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterOwned')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, filterOnSale && styles.filterChipOn]}
              onPress={() => setFilterOnSale(v => !v)}>
              <Text
                style={[
                  styles.filterChipText,
                  filterOnSale && styles.filterChipTextOn,
                ]}>
                {t('LibraryFilterOnSale')}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.sortChip,
                sortMode !== 'recent' && styles.sortChipOn,
              ]}
              onPress={() => setSortMenuOpen(v => !v)}>
              <Text
                style={[
                  styles.sortChipText,
                  sortMode !== 'recent' && styles.sortChipTextOn,
                ]}>
                {`${t('Sort')}: ${activeSortLabel}`}
              </Text>
              {xcloudRecentPending && (
                <ActivityIndicator
                  size={10}
                  color={sortMode !== 'recent' ? '#0B0F0C' : '#8A9A92'}
                />
              )}
              <Icon
                source={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={sortMode !== 'recent' ? '#0B0F0C' : '#8A9A92'}
              />
            </Pressable>
          </View>

          {sortMenuOpen && (
            <View style={styles.sortMenu}>
              {sortOptions.map(option => (
                <Pressable
                  key={option.value}
                  style={styles.sortItem}
                  onPress={() => {
                    setSortMode(option.value);
                    setSortMenuOpen(false);
                  }}>
                  <View style={styles.sortItemLabelRow}>
                    {sortMode === option.value && (
                      <Icon source="check" size={13} color={NVIDIA_ACCENT} />
                    )}
                    <Text style={styles.sortItemLabel}>{option.label}</Text>
                  </View>
                  {!!option.scope && (
                    <Text style={styles.sortItemScope}>{option.scope}</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {catalog.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={item => item.key}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          // A smaller virtualized window trades a bit of scroll-ahead
          // smoothness for a lot less concurrently-decoded image memory --
          // worth it on TV, where the wider screen already means more tiles
          // per row (see numColumns above) on hardware with less headroom.
          initialNumToRender={Platform.isTV ? 10 : 18}
          windowSize={Platform.isTV ? 5 : 11}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {fontSize: 18, fontWeight: '800'},
  count: {fontSize: 12, fontWeight: '700', color: '#8A9A92'},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  searchInput: {flex: 1, padding: 0, fontSize: 14, color: '#E6ECE8'},
  filterRow: {position: 'relative'},
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  filterChipOn: {backgroundColor: XBOX_ACCENT, borderColor: XBOX_ACCENT},
  filterChipText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  filterChipTextOn: {color: '#0B0F0C'},
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  sortChipOn: {backgroundColor: NVIDIA_ACCENT, borderColor: NVIDIA_ACCENT},
  sortChipText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  sortChipTextOn: {color: '#0B0F0C'},
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    width: 230,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,32,36,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
    zIndex: 10,
    elevation: 10,
  },
  sortItem: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(140,140,150,0.16)',
    gap: 2,
  },
  sortItemLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  sortItemLabel: {fontSize: 13, fontWeight: '700'},
  sortItemScope: {fontSize: 10, color: '#8A9A92', paddingLeft: 18},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  centreText: {color: '#8A9A92', fontSize: 14},
  list: {paddingHorizontal: 6, paddingBottom: 20},
  cell: {padding: 4},
  // Raises the whole cell (and the card's focus scale-up inside it) above
  // its row siblings, so the popped-out tile never paints underneath the
  // next one over.
  cellFocused: {zIndex: 10},
  // Square-cropped tile: the card IS the art, badges/title overlay on top of
  // it so more titles fit on screen at once (was a 16:10 card + text footer).
  card: {
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  // D-pad/remote focus indicator (Android TV navigates by moving View focus,
  // not touch) -- without this every tile looked identical regardless of
  // which one the remote had actually landed on.
  cardFocused: {
    borderWidth: 3,
    borderColor: '#FFD54A',
    transform: [{scale: 1.045}],
  },
  thumb: {...StyleSheet.absoluteFillObject},
  thumbEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  thumbEmptyText: {
    color: '#B7C6BD',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Grays out the cover art (not the badges) when the title isn't playable
  // via any of its listed services right now.
  coverDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,16,18,0.8)',
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '28%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  availOverlay: {
    position: 'absolute',
    left: 5,
    top: 5,
    flexDirection: 'row',
    gap: 3,
  },
  availDot: {
    minWidth: 14,
    height: 14,
    paddingHorizontal: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availDotText: {fontSize: 7.5, fontWeight: '800', color: '#0B0F0C'},
  saleBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: SALE_ACCENT,
  },
  saleBadgeText: {fontSize: 8.5, fontWeight: '800', color: '#2B1400'},
  cardTitle: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
});

export default LibraryView;
