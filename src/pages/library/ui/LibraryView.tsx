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
  NativeModules,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Text, Icon} from 'react-native-paper';
import {
  CatalogTitle,
  isCatalogTitleOwned,
  isInGamePass,
} from '../../../entities/catalog-title';
import type {LibraryScreenViewModel} from '../model/useLibraryScreen';
import {
  useTVFocus,
  tvFocusRing,
  TV_FOCUS_COLOR,
} from '../../../shared/ui/tvFocus';
import {RailButton} from '../../../shared/ui/RailControls';
import {InlineSpinner} from '../../../shared/ui/Spinner';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const PS_ACCENT = '#0070D1';
const SALE_ACCENT = '#E67E22';
// Same dim treatment library-title-detail's own per-provider rows use for a
// service a title isn't actually owned on.
const DIM_BADGE_BG = 'rgba(140,140,150,0.3)';
const DIM_BADGE_TEXT = '#8A9A92';

type Props = LibraryScreenViewModel;

type CardCommon = {
  item: CatalogTitle;
  isFocused: boolean;
  discount: number;
  t: Props['t'];
  openTitle: Props['openTitle'];
  openTitleDetail: Props['openTitleDetail'];
  setFocusedKey: Props['setFocusedKey'];
};
type GridCardProps = CardCommon & {numColumns: number; inGamePass: boolean};

// Icon-only mark shown right after a provider badge: a gift (the same icon as
// the free-to-play filter) for "included in that service's catalog" (PS Plus
// catalog / Game Pass). `size`
// matches the badge row it sits in.
const CatalogMark: React.FC<{
  show: boolean;
  color: string;
  label: string;
  size: number;
}> = ({show, color, label, size}) => {
  if (!show) {
    return null;
  }
  return (
    <View
      style={[
        styles.catalogMark,
        {width: size, height: size, backgroundColor: color},
      ]}
      accessibilityLabel={label}>
      <Icon source="gift-outline" size={size - 4} color="#FFFFFF" />
    </View>
  );
};

// The art of one library cell -- cover, dim, badges, sale and title -- shared
// by the phone grid card and the TV tile (each wraps it in its own pressable).
// `big` scales the badges up for the TV's viewing distance.
const CardArt: React.FC<{
  item: CatalogTitle;
  discount: number;
  inGamePass: boolean;
  big: boolean;
  t: Props['t'];
}> = ({item, discount, inGamePass, big, t}) => {
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
  const dotStyle = big
    ? [styles.availDot, styles.availDotBig]
    : styles.availDot;
  const dotText = big
    ? [styles.availDotText, styles.availDotTextBig]
    : styles.availDotText;
  const markSize = big ? 19 : 14;

  return (
    <>
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

      <View style={[styles.availOverlay, big && styles.availOverlayBig]}>
        {item.xcloud && (
          <View
            style={[
              dotStyle,
              {backgroundColor: xcloudOwned ? XBOX_ACCENT : DIM_BADGE_BG},
            ]}>
            <Text style={[dotText, !xcloudOwned && {color: DIM_BADGE_TEXT}]}>
              X
            </Text>
          </View>
        )}
        <CatalogMark
          show={inGamePass}
          color={XBOX_ACCENT}
          label={t('LibraryGamePassIncluded')}
          size={markSize}
        />
        {item.gfn && (
          <View
            style={[
              dotStyle,
              {backgroundColor: gfnOwned ? NVIDIA_ACCENT : DIM_BADGE_BG},
            ]}>
            <Text style={[dotText, !gfnOwned && {color: DIM_BADGE_TEXT}]}>
              N
            </Text>
          </View>
        )}
        {item.psplus && (
          <View
            style={[
              dotStyle,
              {backgroundColor: psplusOwned ? PS_ACCENT : DIM_BADGE_BG},
            ]}>
            <Text style={[dotText, !psplusOwned && {color: DIM_BADGE_TEXT}]}>
              PS
            </Text>
          </View>
        )}
        <CatalogMark
          show={!!item.psplus?.inPlusCatalog}
          color={PS_ACCENT}
          label={t('LibraryPsIncluded')}
          size={markSize}
        />
      </View>

      {discount > 0 && (
        <View style={[styles.saleBadge, big && styles.saleBadgeBig]}>
          <Text style={[styles.saleBadgeText, big && styles.saleBadgeTextBig]}>
            -{discount}%
          </Text>
        </View>
      )}

      <Text
        style={[styles.cardTitle, big && styles.cardTitleBig]}
        numberOfLines={2}>
        {item.title}
      </Text>
    </>
  );
};

// The list cells are memoised so a focus move or a price update re-renders
// only the cells whose own props changed, not every visible card.
const GridCard = React.memo(function GridCard({
  item,
  isFocused,
  discount,
  numColumns,
  inGamePass,
  t,
  openTitle,
  openTitleDetail,
  setFocusedKey,
}: GridCardProps) {
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
        onBlur={() => setFocusedKey(prev => (prev === item.key ? null : prev))}
        android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
        <CardArt
          item={item}
          discount={discount}
          inGamePass={inGamePass}
          big={false}
          t={t}
        />
      </Pressable>
    </View>
  );
});

// TV only: the same square art as the phone grid, but inside a padded tile.
// The generous padding is deliberate -- the tile itself is what takes focus,
// so Android's own default focus highlight (which paints behind opaque
// children and only shows through exposed background) and our focus ring
// have plain mat all around the cover to land on, instead of fighting with
// box art. Constant 2px transparent border so gaining the ring never
// resizes the tile. A short OK press launches; a held OK (or a touch long
// press) opens the details.
const TvTile = React.memo(function TvTile({
  item,
  isFocused,
  discount,
  numColumns,
  inGamePass,
  t,
  openTitle,
  openTitleDetail,
  setFocusedKey,
}: GridCardProps) {
  return (
    <View style={[styles.tvCell, {width: `${100 / numColumns}%`}]}>
      <Pressable
        style={[styles.tvTile, isFocused && styles.tvTileFocused]}
        onPress={() => openTitle(item)}
        onLongPress={() => openTitleDetail(item)}
        onFocus={() => setFocusedKey(item.key)}
        onBlur={() => setFocusedKey(prev => (prev === item.key ? null : prev))}
        android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
        <View style={styles.tvArt}>
          <CardArt
            item={item}
            discount={discount}
            inGamePass={inGamePass}
            big
            t={t}
          />
        </View>
      </Pressable>
    </View>
  );
});

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
  filterOwnership,
  cycleOwnership,
  filterOnSale,
  setFilterOnSale,
  filterFreePlay,
  cycleFreePlay,
  gamePassMap,
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
  // One chip cycles owned -> not owned -> all; its label names the state.
  const ownershipLabel = t(
    filterOwnership === 'owned'
      ? 'LibraryFilterOwned'
      : filterOwnership === 'notOwned'
      ? 'LibraryFilterNotOwned'
      : 'LibraryFilterOwnershipAll',
  );
  const freePlayLabel =
    filterFreePlay === 'gamepass'
      ? t('LibraryFilterFreePlayGamePass')
      : filterFreePlay === 'ps'
      ? t('LibraryFilterFreePlayPs')
      : t('LibraryFilterFreePlay');
  const searchFocus = useTVFocus();
  const tvSearchInputFocus = useTVFocus();
  const tvSearchCloseFocus = useTVFocus();
  // Phone only -- TV's own chips are the shared RailButton (self-managed
  // focus), but phone's plain pill chips still need their own onFocus/onBlur
  // per this app's blanket rule (scripts/check-tv-focus.js) that every
  // onPress element wires one up.
  const xcloudChipFocus = useTVFocus();
  const gfnChipFocus = useTVFocus();
  const psPlusChipFocus = useTVFocus();
  const favoriteChipFocus = useTVFocus();
  const ownedOnlyChipFocus = useTVFocus();
  const onSaleChipFocus = useTVFocus();
  const freePlayChipFocus = useTVFocus();
  const sortChipFocus = useTVFocus();
  const [focusedSortOption, setFocusedSortOption] = React.useState<
    string | null
  >(null);
  // TV only: the search box collapses to an icon button that opens this
  // overlay -- typing with a remote's D-pad is slow, so the always-visible
  // filter chips carry most of the narrowing on TV instead (see the TV
  // navigation rail proposal this implements).
  const [tvSearchOpen, setTvSearchOpen] = React.useState(false);

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

  // Holding OK on the remote opens the focused tile's details (a plain OK
  // press launches). MainActivity.java reports the held press as
  // onDpadCenterLongPress, but only while this screen has asked for it
  // through GamepadManager.setCenterLongPressEnabled -- elsewhere a held OK
  // stays an ordinary press. Refs keep the listener from re-subscribing on
  // every focus move.
  const focusedKeyRef = React.useRef(focusedKey);
  focusedKeyRef.current = focusedKey;
  const sortedRef = React.useRef(sorted);
  sortedRef.current = sorted;
  useFocusEffect(
    React.useCallback(() => {
      if (!Platform.isTV) {
        return;
      }
      NativeModules.GamepadManager?.setCenterLongPressEnabled?.(true);
      const sub = DeviceEventEmitter.addListener(
        'onDpadCenterLongPress',
        () => {
          const key = focusedKeyRef.current;
          const item = key
            ? sortedRef.current.find(entry => entry.key === key)
            : undefined;
          if (item) {
            openTitleDetailRef.current(item);
          }
        },
      );
      return () => {
        sub.remove();
        NativeModules.GamepadManager?.setCenterLongPressEnabled?.(false);
      };
    }, []),
  );

  // Held in refs so the memoised cells get stable handlers even when the
  // view-model hands out new function identities.
  const openTitleRef = React.useRef(openTitle);
  openTitleRef.current = openTitle;
  const openTitleDetailRef = React.useRef(openTitleDetail);
  openTitleDetailRef.current = openTitleDetail;
  const stableOpenTitle = React.useCallback(
    (item: CatalogTitle) => openTitleRef.current(item),
    [],
  );
  const stableOpenTitleDetail = React.useCallback(
    (item: CatalogTitle) => openTitleDetailRef.current(item),
    [],
  );

  const renderItem = React.useCallback(
    ({item}: {item: CatalogTitle}) => {
      const Cell = Platform.isTV ? TvTile : GridCard;
      return (
        <Cell
          item={item}
          isFocused={focusedKey === item.key}
          discount={saleDiscount(item)}
          numColumns={numColumns}
          inGamePass={isInGamePass(item, gamePassMap)}
          t={t}
          openTitle={stableOpenTitle}
          openTitleDetail={stableOpenTitleDetail}
          setFocusedKey={setFocusedKey}
        />
      );
    },
    [
      focusedKey,
      saleDiscount,
      gamePassMap,
      numColumns,
      t,
      stableOpenTitle,
      stableOpenTitleDetail,
      setFocusedKey,
    ],
  );

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
          {gfnFullCatalogLoading && <InlineSpinner size={12} color="#8A9A92" />}
        </View>
        {Platform.isTV ? (
          <>
            <View style={styles.tvToolbarRow}>
              <RailButton
                icon="magnify"
                label={t('Search')}
                accent={XBOX_ACCENT}
                style={styles.tvSearchGrow}
                onPress={() => setTvSearchOpen(true)}
              />
              {/* TV has no pull-to-refresh gesture: same refresh, as a button. */}
              <RailButton
                iconOnly
                icon="refresh"
                label={refreshing ? t('Loading...') : t('Refresh')}
                accent={XBOX_ACCENT}
                onPress={() => {
                  if (!refreshing) {
                    onRefresh();
                  }
                }}
              />
            </View>
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
            {Platform.isTV ? (
              <>
                <RailButton
                  iconOnly
                  letter="X"
                  label={t('LibraryFilterXcloud')}
                  active={filterXcloud}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={() => setFilterXcloud(v => !v)}
                />
                <RailButton
                  iconOnly
                  letter="N"
                  label={t('LibraryFilterGfn')}
                  active={filterGfn}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={() => setFilterGfn(v => !v)}
                />
                <RailButton
                  iconOnly
                  letter="PS"
                  label={t('LibraryFilterPsPlus')}
                  active={filterPsPlus}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={() => setFilterPsPlus(v => !v)}
                />
                <RailButton
                  iconOnly
                  icon="heart-outline"
                  label={t('LibraryFilterFavorite')}
                  active={filterFavorite}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={() => setFilterFavorite(v => !v)}
                />
                <RailButton
                  iconOnly
                  icon={
                    filterOwnership === 'notOwned'
                      ? 'close-circle-outline'
                      : 'check-circle-outline'
                  }
                  label={ownershipLabel}
                  active={filterOwnership !== 'all'}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={cycleOwnership}
                />
                <RailButton
                  iconOnly
                  icon="tag-outline"
                  label={t('LibraryFilterOnSale')}
                  active={filterOnSale}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={() => setFilterOnSale(v => !v)}
                />
                <RailButton
                  iconOnly
                  icon="gift-outline"
                  label={freePlayLabel}
                  active={filterFreePlay !== 'off'}
                  accent={XBOX_ACCENT}
                  fill
                  onPress={cycleFreePlay}
                />
                <View style={styles.sortChipTv}>
                  <RailButton
                    iconOnly
                    icon="sort"
                    trailingIcon={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                    label={`${t('Sort')}: ${activeSortLabel}`}
                    active={sortMode !== 'recent'}
                    accent={NVIDIA_ACCENT}
                    fill
                    onPress={() => setSortMenuOpen(v => !v)}
                  />
                </View>
              </>
            ) : (
              <>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterXcloud && styles.filterChipOn,
                    xcloudChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setFilterXcloud(v => !v)}
                  onFocus={xcloudChipFocus.onFocus}
                  onBlur={xcloudChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterXcloud && styles.filterChipTextOn,
                    ]}>
                    {t('LibraryFilterXcloud')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterGfn && styles.filterChipOn,
                    gfnChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setFilterGfn(v => !v)}
                  onFocus={gfnChipFocus.onFocus}
                  onBlur={gfnChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterGfn && styles.filterChipTextOn,
                    ]}>
                    {t('LibraryFilterGfn')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterPsPlus && styles.filterChipOn,
                    psPlusChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setFilterPsPlus(v => !v)}
                  onFocus={psPlusChipFocus.onFocus}
                  onBlur={psPlusChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterPsPlus && styles.filterChipTextOn,
                    ]}>
                    {t('LibraryFilterPsPlus')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterFavorite && styles.filterChipOn,
                    favoriteChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setFilterFavorite(v => !v)}
                  onFocus={favoriteChipFocus.onFocus}
                  onBlur={favoriteChipFocus.onBlur}>
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
                    filterOwnership !== 'all' && styles.filterChipOn,
                    ownedOnlyChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={cycleOwnership}
                  onFocus={ownedOnlyChipFocus.onFocus}
                  onBlur={ownedOnlyChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterOwnership !== 'all' && styles.filterChipTextOn,
                    ]}>
                    {ownershipLabel}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    filterOnSale && styles.filterChipOn,
                    onSaleChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setFilterOnSale(v => !v)}
                  onFocus={onSaleChipFocus.onFocus}
                  onBlur={onSaleChipFocus.onBlur}>
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
                    styles.filterChip,
                    filterFreePlay !== 'off' && styles.filterChipOn,
                    freePlayChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={cycleFreePlay}
                  onFocus={freePlayChipFocus.onFocus}
                  onBlur={freePlayChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterFreePlay !== 'off' && styles.filterChipTextOn,
                    ]}>
                    {freePlayLabel}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.sortChip,
                    sortMode !== 'recent' && styles.sortChipOn,
                    sortChipFocus.focused && tvFocusRing,
                  ]}
                  onPress={() => setSortMenuOpen(v => !v)}
                  onFocus={sortChipFocus.onFocus}
                  onBlur={sortChipFocus.onBlur}>
                  <Text
                    style={[
                      styles.sortChipText,
                      sortMode !== 'recent' && styles.sortChipTextOn,
                    ]}>
                    {`${t('Sort')}: ${activeSortLabel}`}
                  </Text>
                  <Icon
                    source={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={sortMode !== 'recent' ? '#0B0F0C' : '#8A9A92'}
                  />
                </Pressable>
              </>
            )}
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
          <InlineSpinner />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          key={Platform.isTV ? `tv-${numColumns}` : numColumns}
          numColumns={numColumns}
          keyExtractor={item => item.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          // A smaller virtualized window trades a bit of scroll-ahead
          // smoothness for a lot less concurrently-decoded image memory --
          // worth it on TV, where the wider screen already means more tiles
          // per row (see numColumns above) on hardware with less headroom.
          initialNumToRender={Platform.isTV ? 15 : 18}
          windowSize={Platform.isTV ? 5 : 11}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {Platform.isTV && catalog.length > 0 && (
        <View style={styles.tvHintBar}>
          <Text style={styles.tvHintText}>
            <Text style={styles.tvHintKey}>{t('LibraryTvHintOk')}</Text>
            {'  '}
            {t('LibraryTvHintLaunch')}
          </Text>
          <Text style={styles.tvHintText}>
            <Text style={styles.tvHintKey}>{t('LibraryTvHintOkHold')}</Text>
            {'  '}
            {t('LibraryTvHintDetail')}
          </Text>
        </View>
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
  // TV: the search box above collapses to this RailButton -- same shape as
  // the filter chips below it (icon + label, not an icon-only square) so
  // Android's own per-view focus highlight has the same exposed mat area to
  // land on, instead of the thin 2px-border-only cue a small icon button
  // gave it before. alignSelf keeps it content-sized -- `header`'s a column
  // flex container, which would otherwise stretch a bare RailButton (no
  // explicit width of its own) to the header's full width.
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
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  // Phone only now -- TV uses the shared RailButton (see shared/ui/
  // RailControls.tsx) instead of its own lookalike chip, after this file's
  // own hand-rolled version turned out to be the third near-identical copy
  // of that same box across the app.
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
  // TV only -- pushes the sort RailButton to the row's far end, same as
  // phone's sortChip's own marginLeft:'auto'.
  sortChipTv: {marginLeft: 'auto'},
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
  // TV tile grid (5 columns): each cell is an even split of the row, same
  // gutter as the phone grid's own `cell`.
  tvCell: {padding: 4},
  // The tile is the focusable thing and is deliberately much bigger than the
  // cover it holds (generous padding), so Android's default focus highlight
  // and our ring have plain mat to show on. Constant 2px border (transparent
  // when idle) so gaining the ring never resizes the tile.
  tvTile: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tvTileFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(255,213,74,0.12)',
  },
  tvArt: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  // The TV-size variants of the phone card's badges/sale/title.
  availOverlayBig: {left: 8, top: 8, gap: 4},
  availDotBig: {
    minWidth: 19,
    height: 19,
    borderRadius: 5,
    paddingHorizontal: 3,
  },
  availDotTextBig: {fontSize: 10.5},
  saleBadgeBig: {right: 8, top: 8, borderRadius: 6, paddingHorizontal: 7},
  saleBadgeTextBig: {fontSize: 12},
  cardTitleBig: {left: 10, right: 10, bottom: 9, fontSize: 14},
  // Key hints under the grid (TV only).
  tvHintBar: {
    flexDirection: 'row',
    gap: 28,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tvHintText: {fontSize: 13, color: '#9AA9A1'},
  tvHintKey: {fontWeight: '800', color: '#EEF4EF'},
  // In a service's catalog (PS Plus / Game Pass): solid service colour (set
  // inline).
  catalogMark: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Search (grows) + refresh, side by side above the filter row.
  tvToolbarRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  tvSearchGrow: {flex: 1},
});

export default LibraryView;
