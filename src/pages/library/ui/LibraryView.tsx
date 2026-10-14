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
  Modal,
  DeviceEventEmitter,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Text, Icon, ActivityIndicator} from 'react-native-paper';
import {
  CatalogTitle,
  isCatalogTitleOwned,
} from '../../../entities/catalog-title';
import type {LibraryScreenViewModel} from '../model/useLibraryScreen';
import {
  useTVFocus,
  tvFocusRing,
  TV_FOCUS_COLOR,
} from '../../../shared/ui/tvFocus';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const PS_ACCENT = '#0070D1';
const SALE_ACCENT = '#E67E22';
// TV: 3 wide cards per row -- a dense single-column list had too little
// information density, and a dense image-only grid was the original focus-
// visibility problem (see `wideCard`'s own comment). numColumns itself still
// comes from the view-model for phone's own grid; this is TV-only and fixed.
const TV_GRID_COLUMNS = 3;
// Same dim treatment library-title-detail's own per-provider rows use for a
// service a title isn't actually owned on.
const DIM_BADGE_BG = 'rgba(140,140,150,0.3)';
const DIM_BADGE_TEXT = '#8A9A92';

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
  numColumns,
  refreshing,
  onRefresh,
  openTitle,
  openTitleDetail,
  saleDiscount,
}) => {
  const xcloudChipFocus = useTVFocus();
  const gfnChipFocus = useTVFocus();
  const psPlusChipFocus = useTVFocus();
  const favoriteChipFocus = useTVFocus();
  const ownedOnlyChipFocus = useTVFocus();
  const onSaleChipFocus = useTVFocus();
  const sortChipFocus = useTVFocus();
  const searchFocus = useTVFocus();
  const tvSearchInputFocus = useTVFocus();
  const tvSearchCloseFocus = useTVFocus();
  const [focusedSortOption, setFocusedSortOption] = React.useState<
    string | null
  >(null);
  // TV only: the search box collapses to an icon button that opens this
  // overlay -- typing with a remote's D-pad is slow, so the always-visible
  // filter chips carry most of the narrowing on TV instead (see the TV
  // navigation rail proposal this implements).
  const [tvSearchOpen, setTvSearchOpen] = React.useState(false);

  // A toggle chip's "on" state (filterChipOn/sortChipOn) already fills the
  // chip with its own accent color -- focus must layer on top of that
  // without erasing it, so the border is the one signal that always wins; an
  // already-accent-filled "on" chip never looks like it un-toggled itself
  // while focused. No background tint on focus here on purpose -- that was
  // tried (see this file's own history) and still read weakly on real
  // hardware, so border + text/icon color (always drawn on top, never
  // competing with whatever the platform draws underneath) are the only
  // focus signals now.
  const chipStyle = (
    base: object,
    active: boolean,
    focused: boolean,
    onStyle: object,
  ) => [base, active && onStyle, focused && styles.chipFocusedBorder];
  const chipTextStyle = (
    base: object,
    active: boolean,
    focused: boolean,
    onTextStyle: object,
  ) => [
    base,
    active && onTextStyle,
    focused && !active && styles.chipFocusedText,
  ];
  // Same 3-state color rule as chipTextStyle, as a plain color string for
  // the chip's leading icon (react-native-paper's Icon takes `color`, not a
  // style array).
  const chipContentColor = (active: boolean, focused: boolean) =>
    active ? '#0B0F0C' : focused ? TV_FOCUS_COLOR : '#8A9A92';

  // Google TV's remote mic/voice-search button (MainActivity.java's own
  // onKeyDown -- KEYCODE_SEARCH/VOICE_ASSIST/ASSIST, all three since remotes
  // and launchers vary in which one they actually send) opens this screen's
  // own search overlay instead of the system's. useFocusEffect rather than a
  // plain mount effect so a press while some other tab is active doesn't
  // silently open Library's overlay behind it (every tab stays mounted at
  // once -- see App.tsx's MainTabs).
  useFocusEffect(
    React.useCallback(() => {
      if (!Platform.isTV) {
        return;
      }
      const sub = DeviceEventEmitter.addListener('onSearchKeyPress', () => {
        setTvSearchOpen(true);
      });
      return () => sub.remove();
    }, []),
  );

  const renderCard = ({item}: {item: CatalogTitle}) => {
    // Cover art itself grays out when the title isn't playable via any of
    // its listed services today (no Game Pass entitlement, no owned GFN
    // store variant, no owned PS Plus game).
    const isPlayable = isCatalogTitleOwned(item);
    // Each badge answers "owned on this service" individually -- a title
    // supported by all three but owned on only one (e.g. Xbox/xCloud) must
    // only light up that one, not every service it merely appears under.
    const xcloudOwned = !!item.xcloud?.hasEntitlement;
    const gfnOwned = !!item.gfn?.variants.some(v => v.owned);
    const psplusOwned = !!item.psplus?.isOwned || !!item.psplus?.inPlusCatalog;
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
              <View
                style={[
                  styles.availDot,
                  {backgroundColor: xcloudOwned ? XBOX_ACCENT : DIM_BADGE_BG},
                ]}>
                <Text
                  style={[
                    styles.availDotText,
                    !xcloudOwned && {color: DIM_BADGE_TEXT},
                  ]}>
                  X
                </Text>
              </View>
            )}
            {item.gfn && (
              <View
                style={[
                  styles.availDot,
                  {backgroundColor: gfnOwned ? NVIDIA_ACCENT : DIM_BADGE_BG},
                ]}>
                <Text
                  style={[
                    styles.availDotText,
                    !gfnOwned && {color: DIM_BADGE_TEXT},
                  ]}>
                  N
                </Text>
              </View>
            )}
            {item.psplus && (
              <View
                style={[
                  styles.availDot,
                  {backgroundColor: psplusOwned ? PS_ACCENT : DIM_BADGE_BG},
                ]}>
                <Text
                  style={[
                    styles.availDotText,
                    !psplusOwned && {color: DIM_BADGE_TEXT},
                  ]}>
                  PS
                </Text>
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

  // TV only: 3 wide cards per row instead of the dense image-only grid
  // above. A single-column list (this screen's own earlier history) had too
  // little information density; this keeps that list's layout -- a bigger
  // (84x84) but still non-focus-conditional thumbnail with plain exposed
  // mat around it, title/badges beside it -- just 3 across instead of 1, so
  // the focus ring (and Android's own default per-view focus highlight,
  // which paints behind opaque children and only shows through exposed
  // background) still has plain background to land on instead of fighting
  // with box art the way the old dense square-image grid did.
  const renderWideCard = ({item}: {item: CatalogTitle}) => {
    const isPlayable = isCatalogTitleOwned(item);
    const xcloudOwned = !!item.xcloud?.hasEntitlement;
    const gfnOwned = !!item.gfn?.variants.some(v => v.owned);
    const psplusOwned = !!item.psplus?.isOwned || !!item.psplus?.inPlusCatalog;
    const discount = saleDiscount(item);
    const isFocused = focusedKey === item.key;

    return (
      <View
        style={[
          styles.wideCell,
          {width: `${100 / TV_GRID_COLUMNS}%`},
          isFocused && styles.cellFocused,
        ]}>
        <Pressable
          style={[styles.wideCard, isFocused && styles.wideCardFocused]}
          onPress={() => openTitle(item)}
          onLongPress={() => openTitleDetail(item)}
          onFocus={() => setFocusedKey(item.key)}
          onBlur={() =>
            setFocusedKey(prev => (prev === item.key ? null : prev))
          }
          android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
          <View style={styles.wideThumb}>
            {item.imageUrl ? (
              <Image
                source={{uri: item.imageUrl}}
                resizeMode="cover"
                style={styles.thumb}
              />
            ) : (
              <View style={styles.wideThumbEmpty}>
                <Text style={styles.wideThumbEmptyText} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.wideBody}>
            <Text
              style={[styles.wideTitle, isFocused && styles.wideTitleFocused]}
              numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.cardBadgesLine}>
              {item.xcloud && (
                <View
                  style={[
                    styles.cardBadge,
                    {backgroundColor: xcloudOwned ? XBOX_ACCENT : DIM_BADGE_BG},
                  ]}>
                  <Text
                    style={[
                      styles.cardBadgeText,
                      !xcloudOwned && {color: DIM_BADGE_TEXT},
                    ]}>
                    X
                  </Text>
                </View>
              )}
              {item.gfn && (
                <View
                  style={[
                    styles.cardBadge,
                    {backgroundColor: gfnOwned ? NVIDIA_ACCENT : DIM_BADGE_BG},
                  ]}>
                  <Text
                    style={[
                      styles.cardBadgeText,
                      !gfnOwned && {color: DIM_BADGE_TEXT},
                    ]}>
                    N
                  </Text>
                </View>
              )}
              {item.psplus && (
                <View
                  style={[
                    styles.cardBadge,
                    {backgroundColor: psplusOwned ? PS_ACCENT : DIM_BADGE_BG},
                  ]}>
                  <Text
                    style={[
                      styles.cardBadgeText,
                      !psplusOwned && {color: DIM_BADGE_TEXT},
                    ]}>
                    PS
                  </Text>
                </View>
              )}
              {discount > 0 && (
                <Text style={styles.cardDiscount}>
                  {t('LibraryRowDiscount', {percent: discount})}
                </Text>
              )}
            </View>
            <Text
              style={
                isPlayable ? styles.wideOwnedTextOn : styles.wideOwnedTextOff
              }>
              {isPlayable ? t('LibraryFilterOwned') : t('LibraryRowNotOwned')}
            </Text>
          </View>
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
        {Platform.isTV ? (
          <>
            <Pressable
              style={[
                styles.tvSearchIconButton,
                searchFocus.focused && tvFocusRing,
              ]}
              onPress={() => setTvSearchOpen(true)}
              onFocus={searchFocus.onFocus}
              onBlur={searchFocus.onBlur}
              accessibilityRole="button"
              accessibilityLabel={t('Search')}>
              <Icon
                source="magnify"
                size={18}
                color={searchFocus.focused ? TV_FOCUS_COLOR : '#8A9A92'}
              />
            </Pressable>
            <Modal
              visible={tvSearchOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setTvSearchOpen(false)}>
              <View style={styles.tvSearchOverlay}>
                <View
                  style={[
                    styles.tvSearchBox,
                    tvSearchInputFocus.focused && styles.tvSearchBoxFocused,
                  ]}>
                  <Icon
                    source="magnify"
                    size={20}
                    color={
                      tvSearchInputFocus.focused ? TV_FOCUS_COLOR : '#8A9A92'
                    }
                  />
                  <TextInput
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder={t('Search')}
                    placeholderTextColor="#8A9A92"
                    style={styles.tvSearchInput}
                    onFocus={tvSearchInputFocus.onFocus}
                    onBlur={tvSearchInputFocus.onBlur}
                    autoFocus
                  />
                  <Pressable
                    style={[
                      styles.tvSearchCloseButton,
                      tvSearchCloseFocus.focused && tvFocusRing,
                    ]}
                    onPress={() => setTvSearchOpen(false)}
                    onFocus={tvSearchCloseFocus.onFocus}
                    onBlur={tvSearchCloseFocus.onBlur}
                    accessibilityRole="button"
                    accessibilityLabel={t('Close')}>
                    <Icon
                      source="close"
                      size={18}
                      color={
                        tvSearchCloseFocus.focused ? TV_FOCUS_COLOR : '#E6ECE8'
                      }
                    />
                  </Pressable>
                </View>
              </View>
            </Modal>
          </>
        ) : (
          <View
            style={[
              styles.searchBox,
              searchFocus.focused && styles.searchBoxFocused,
            ]}>
            <Icon
              source="magnify"
              size={18}
              color={searchFocus.focused ? TV_FOCUS_COLOR : '#8A9A92'}
            />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder={t('Search')}
              placeholderTextColor="#8A9A92"
              style={styles.searchInput}
              onFocus={searchFocus.onFocus}
              onBlur={searchFocus.onBlur}
            />
          </View>
        )}
        <View style={styles.filterRow}>
          <View style={styles.chipsRow}>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterXcloud,
                xcloudChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterXcloud(v => !v)}
              onFocus={xcloudChipFocus.onFocus}
              onBlur={xcloudChipFocus.onBlur}>
              {Platform.isTV && (
                <Text
                  style={chipTextStyle(
                    styles.filterChipText,
                    filterXcloud,
                    xcloudChipFocus.focused,
                    styles.filterChipTextOn,
                  )}>
                  X
                </Text>
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterXcloud,
                  xcloudChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterXcloud')}
              </Text>
            </Pressable>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterGfn,
                gfnChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterGfn(v => !v)}
              onFocus={gfnChipFocus.onFocus}
              onBlur={gfnChipFocus.onBlur}>
              {Platform.isTV && (
                <Text
                  style={chipTextStyle(
                    styles.filterChipText,
                    filterGfn,
                    gfnChipFocus.focused,
                    styles.filterChipTextOn,
                  )}>
                  N
                </Text>
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterGfn,
                  gfnChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterGfn')}
              </Text>
            </Pressable>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterPsPlus,
                psPlusChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterPsPlus(v => !v)}
              onFocus={psPlusChipFocus.onFocus}
              onBlur={psPlusChipFocus.onBlur}>
              {Platform.isTV && (
                <Text
                  style={chipTextStyle(
                    styles.filterChipText,
                    filterPsPlus,
                    psPlusChipFocus.focused,
                    styles.filterChipTextOn,
                  )}>
                  PS
                </Text>
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterPsPlus,
                  psPlusChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterPsPlus')}
              </Text>
            </Pressable>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterFavorite,
                favoriteChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterFavorite(v => !v)}
              onFocus={favoriteChipFocus.onFocus}
              onBlur={favoriteChipFocus.onBlur}>
              {Platform.isTV && (
                <Icon
                  source="heart-outline"
                  size={13}
                  color={chipContentColor(
                    filterFavorite,
                    favoriteChipFocus.focused,
                  )}
                />
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterFavorite,
                  favoriteChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterFavorite')}
              </Text>
            </Pressable>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterOwnedOnly,
                ownedOnlyChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterOwnedOnly(v => !v)}
              onFocus={ownedOnlyChipFocus.onFocus}
              onBlur={ownedOnlyChipFocus.onBlur}>
              {Platform.isTV && (
                <Icon
                  source="check-circle-outline"
                  size={13}
                  color={chipContentColor(
                    filterOwnedOnly,
                    ownedOnlyChipFocus.focused,
                  )}
                />
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterOwnedOnly,
                  ownedOnlyChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterOwned')}
              </Text>
            </Pressable>
            <Pressable
              style={chipStyle(
                styles.filterChip,
                filterOnSale,
                onSaleChipFocus.focused,
                styles.filterChipOn,
              )}
              onPress={() => setFilterOnSale(v => !v)}
              onFocus={onSaleChipFocus.onFocus}
              onBlur={onSaleChipFocus.onBlur}>
              {Platform.isTV && (
                <Icon
                  source="tag-outline"
                  size={13}
                  color={chipContentColor(
                    filterOnSale,
                    onSaleChipFocus.focused,
                  )}
                />
              )}
              <Text
                style={chipTextStyle(
                  styles.filterChipText,
                  filterOnSale,
                  onSaleChipFocus.focused,
                  styles.filterChipTextOn,
                )}>
                {t('LibraryFilterOnSale')}
              </Text>
            </Pressable>

            <Pressable
              style={chipStyle(
                styles.sortChip,
                sortMode !== 'recent',
                sortChipFocus.focused,
                styles.sortChipOn,
              )}
              onPress={() => setSortMenuOpen(v => !v)}
              onFocus={sortChipFocus.onFocus}
              onBlur={sortChipFocus.onBlur}>
              <Text
                style={chipTextStyle(
                  styles.sortChipText,
                  sortMode !== 'recent',
                  sortChipFocus.focused,
                  styles.sortChipTextOn,
                )}>
                {`${t('Sort')}: ${activeSortLabel}`}
              </Text>
              <Icon
                source={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={
                  sortChipFocus.focused && sortMode === 'recent'
                    ? TV_FOCUS_COLOR
                    : sortMode !== 'recent'
                    ? '#0B0F0C'
                    : '#8A9A92'
                }
              />
            </Pressable>
          </View>

          {sortMenuOpen && (
            <View style={styles.sortMenu}>
              {sortOptions.map(option => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.sortItem,
                    focusedSortOption === option.value && tvFocusRing,
                  ]}
                  onPress={() => {
                    setSortMode(option.value);
                    setSortMenuOpen(false);
                  }}
                  onFocus={() => setFocusedSortOption(option.value)}
                  onBlur={() =>
                    setFocusedSortOption(prev =>
                      prev === option.value ? null : prev,
                    )
                  }>
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
          key={Platform.isTV ? `tv-wide-${TV_GRID_COLUMNS}` : numColumns}
          numColumns={Platform.isTV ? TV_GRID_COLUMNS : numColumns}
          keyExtractor={item => item.key}
          renderItem={Platform.isTV ? renderWideCard : renderCard}
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
    // Constant width (only the color changes on focus) so gaining a focus
    // ring never shifts this box's size the way the 1px->2px jump on the
    // filter chips below does.
    borderWidth: 2,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  // TextInput has no onPress, so this was invisible to
  // scripts/check-tv-focus.js's static check and had no focus indicator at
  // all until this -- see Google TV's focus-system guide's Outline + Color
  // indications (developer.android.com/design/ui/tv/guides/styles/focus-system).
  searchBoxFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(255,213,74,0.1)',
  },
  searchInput: {flex: 1, padding: 0, fontSize: 14, color: '#E6ECE8'},
  // TV: the search box above collapses to this icon button -- same visual
  // footprint as a filter chip so it sits naturally in the header row.
  tvSearchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 2,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  tvSearchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,7,6,0.72)',
    alignItems: 'center',
    paddingTop: 90,
  },
  tvSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '70%',
    maxWidth: 640,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: '#1B2120',
    // Plain until the input itself actually has focus -- this used to be a
    // permanent TV_FOCUS_COLOR border regardless of real focus state, which
    // made it look focused even when, say, the close button had the
    // remote's attention instead.
    borderWidth: 2,
    borderColor: 'rgba(140,140,150,0.3)',
  },
  tvSearchBoxFocused: {
    borderColor: TV_FOCUS_COLOR,
  },
  tvSearchInput: {flex: 1, padding: 0, fontSize: 18, color: '#E6ECE8'},
  tvSearchCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(140,140,150,0.18)',
  },
  filterRow: {position: 'relative'},
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  // TV gets a bigger, plainer idle chip (more padding, a flatter near-
  // transparent fill instead of the mid-gray tint phone uses) -- more
  // exposed background for Android's own default focus highlight to land
  // on, same reasoning as `row`'s mat. A constant 2px border (transparent
  // when idle) keeps the chip's size the same whether or not it's focused.
  // TV gets a rounded-rect shape (not a pill) with room for a leading
  // icon/letter -- the same RailButton box the in-stream control rail's
  // buttons use, confirmed to read clearly on real hardware, rather than a
  // shape invented just for this chip.
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Platform.isTV ? 9 : 6,
    paddingHorizontal: Platform.isTV ? 16 : 10,
    borderRadius: Platform.isTV ? 9 : 999,
    backgroundColor: Platform.isTV
      ? 'rgba(255,255,255,0.04)'
      : 'rgba(140,140,150,0.14)',
    borderWidth: Platform.isTV ? 2 : 1,
    borderColor: Platform.isTV ? 'transparent' : 'rgba(140,140,150,0.24)',
  },
  filterChipOn: {backgroundColor: XBOX_ACCENT, borderColor: XBOX_ACCENT},
  filterChipText: {
    fontSize: Platform.isTV ? 12.5 : 11.5,
    fontWeight: '700',
    color: '#8A9A92',
  },
  filterChipTextOn: {color: '#0B0F0C'},
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingVertical: Platform.isTV ? 9 : 6,
    paddingHorizontal: Platform.isTV ? 16 : 10,
    borderRadius: Platform.isTV ? 9 : 999,
    backgroundColor: Platform.isTV
      ? 'rgba(255,255,255,0.04)'
      : 'rgba(140,140,150,0.14)',
    borderWidth: Platform.isTV ? 2 : 1,
    borderColor: Platform.isTV ? 'transparent' : 'rgba(140,140,150,0.24)',
  },
  sortChipOn: {backgroundColor: NVIDIA_ACCENT, borderColor: NVIDIA_ACCENT},
  sortChipText: {
    fontSize: Platform.isTV ? 12.5 : 11.5,
    fontWeight: '700',
    color: '#8A9A92',
  },
  sortChipTextOn: {color: '#0B0F0C'},
  // Shared focus layer for both chip kinds above -- the border always wins
  // (so an "on" chip still visibly has the remote's attention); the text
  // color swap only applies while the chip is OFF, so an already-accent-
  // filled "on" chip never looks like it un-toggled itself.
  chipFocusedBorder: {borderColor: TV_FOCUS_COLOR},
  chipFocusedText: {color: TV_FOCUS_COLOR},
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
  // next one over. No padding/margin/background here on purpose -- an
  // earlier version tried a halo this way (extra padding + a tinted
  // background, to work around `card`'s overflow:hidden clipping a shadow),
  // but changing a flex child's padding on focus reflows its siblings in
  // the grid, which read as the grid's layout visibly shifting whenever
  // focus moved. zIndex alone has no layout cost.
  cellFocused: {
    zIndex: 10,
  },
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
  // which one the remote had actually landed on. `card` has a fixed width
  // (from `cell`'s percentage width, independent of its own border), so a
  // border-width change here doesn't reflow neighboring cells the way
  // `cellFocused`'s old padding/margin halo did.
  cardFocused: {
    borderWidth: 3,
    borderColor: TV_FOCUS_COLOR,
    transform: [{scale: 1.05}],
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
  // TV 3-up grid: each cell is a 3-way split of the row, same gutter as the
  // phone grid's own `cell`.
  wideCell: {padding: 4},
  // Plain mat, always present (not conditional on focus) -- the thumbnail
  // is a fixed 84x84, so most of the card is exposed background for a
  // focus ring and Android's own default focus highlight to land on,
  // unlike the dense image-only grid this replaced. Constant 2px border
  // (transparent when idle) so gaining the ring never resizes the card,
  // same technique as the filter chips.
  wideCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(140,140,150,0.10)',
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 10,
  },
  wideCardFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(255,213,74,0.12)',
  },
  wideThumb: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(140,140,150,0.2)',
    flexShrink: 0,
  },
  wideThumbEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  wideThumbEmptyText: {
    color: '#B7C6BD',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  wideBody: {flex: 1, gap: 4, minWidth: 0},
  wideTitle: {fontSize: 13, fontWeight: '800', color: '#E6ECE8'},
  wideTitleFocused: {color: TV_FOCUS_COLOR},
  wideOwnedTextOn: {fontSize: 9.5, fontWeight: '700', color: '#4FA82F'},
  wideOwnedTextOff: {fontSize: 9.5, fontWeight: '700', color: DIM_BADGE_TEXT},
  // Shared between the 3-up grid's badges and the sale callout.
  cardBadgesLine: {flexDirection: 'row', alignItems: 'center', gap: 4},
  cardBadge: {
    minWidth: 16,
    height: 13,
    paddingHorizontal: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadgeText: {fontSize: 7, fontWeight: '800', color: '#0B0F0C'},
  cardDiscount: {fontSize: 9.5, fontWeight: '800', color: SALE_ACCENT},
});

export default LibraryView;
