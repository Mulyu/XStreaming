import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import {AppButton} from '../../../shared/ui/Buttons';
import SearchField from '../../../shared/ui/SearchField';
import TvSearchModal from '../../../shared/ui/TvSearchModal';
import LibraryFilterSheet from './LibraryFilterSheet';
import LibraryHome from './LibraryHome';
import {InlineSpinner} from '../../../shared/ui/Spinner';
import {appDebugLog} from '../../../shared/lib/appDebugLog';
import {alpha, palette} from '../../../shared/config/palette';

// Same dim treatment library-title-detail's own per-provider rows use for a
// service a title isn't actually owned on.
const DIM_BADGE_BG = alpha(palette.text, 0.3);
const DIM_BADGE_TEXT = palette.textSoft;

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
type GridCardProps = CardCommon & {
  numColumns: number;
  inGamePass: boolean;
  // Phone only: the one-tap button on the card's lower right -- the heart for
  // a title that is owned, the bookmark (wishlist) for one that isn't. `on`
  // is that button's current state.
  action: 'favorite' | 'wishlist';
  actionOn: boolean;
  onToggleFavorite: (item: CatalogTitle) => void;
  onToggleWishlist: (item: CatalogTitle) => void;
};

// The card's favorite / wishlist toggle. A sibling of the card's own
// Pressable (not nested in it) so a tap on it never also opens the title.
const CardAction: React.FC<{
  item: CatalogTitle;
  kind: 'favorite' | 'wishlist';
  on: boolean;
  label: string;
  onToggle: (item: CatalogTitle) => void;
}> = ({item, kind, on, label, onToggle}) => {
  const focus = useTVFocus();
  const icon =
    kind === 'favorite'
      ? on
        ? 'heart'
        : 'heart-outline'
      : on
      ? 'bookmark'
      : 'bookmark-outline';
  const onColor = kind === 'favorite' ? palette.sale : palette.accent;
  return (
    <Pressable
      style={[styles.cardAction, focus.focused && tvFocusRing]}
      hitSlop={6}
      onPress={() => onToggle(item)}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole="button"
      accessibilityState={{selected: on}}
      accessibilityLabel={label}>
      <Icon source={icon} size={19} color={on ? onColor : palette.white} />
    </Pressable>
  );
};

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
      <Icon source="gift-outline" size={size - 4} color={palette.white} />
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
  // Leave room at the title's right for the card's action button.
  actionSpace?: boolean;
  t: Props['t'];
}> = ({item, discount, inGamePass, big, actionSpace, t}) => {
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
              {
                backgroundColor: xcloudOwned
                  ? palette.provider.xbox
                  : DIM_BADGE_BG,
              },
            ]}>
            <Text style={[dotText, !xcloudOwned && {color: DIM_BADGE_TEXT}]}>
              X
            </Text>
          </View>
        )}
        <CatalogMark
          show={inGamePass}
          color={palette.provider.xbox}
          label={t('LibraryGamePassIncluded')}
          size={markSize}
        />
        {item.gfn && (
          <View
            style={[
              dotStyle,
              {backgroundColor: gfnOwned ? palette.provider.gfn : DIM_BADGE_BG},
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
              {
                backgroundColor: psplusOwned
                  ? palette.provider.ps
                  : DIM_BADGE_BG,
              },
            ]}>
            <Text style={[dotText, !psplusOwned && {color: DIM_BADGE_TEXT}]}>
              PS
            </Text>
          </View>
        )}
        <CatalogMark
          show={!!item.psplus?.inPlusCatalog}
          color={palette.provider.ps}
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
        style={[
          styles.cardTitle,
          big && styles.cardTitleBig,
          actionSpace && styles.cardTitleWithAction,
        ]}
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
  action,
  actionOn,
  onToggleFavorite,
  onToggleWishlist,
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
        android_ripple={{color: alpha(palette.text, 0.15)}}>
        <CardArt
          item={item}
          discount={discount}
          inGamePass={inGamePass}
          big={false}
          actionSpace
          t={t}
        />
      </Pressable>
      <CardAction
        item={item}
        kind={action}
        on={actionOn}
        label={t(
          action === 'favorite'
            ? actionOn
              ? 'FavoriteRemove'
              : 'FavoriteAdd'
            : actionOn
            ? 'WishlistRemove'
            : 'WishlistAdd',
        )}
        onToggle={action === 'favorite' ? onToggleFavorite : onToggleWishlist}
      />
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
        android_ripple={{color: alpha(palette.text, 0.15)}}>
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
  libraryTab,
  selectTab,
  homeShelves,
  filterCount,
  resetFilters,
  wishlistSaleCount,
  favoriteKeys,
  wishlistKeys,
  toggleFavorite,
  toggleWishlist,
  filterOwnership,
  setFilterOwnership,
  filterOnSale,
  setFilterOnSale,
  filterCatalog,
  toggleCatalog,
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
  const [focusedSortOption, setFocusedSortOption] = React.useState<
    string | null
  >(null);
  // TV only: search is a button that opens an overlay -- typing with a
  // remote's D-pad is slow, so the tabs and the Filter sheet carry most of
  // the narrowing on TV instead.
  const [tvSearchOpen, setTvSearchOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);

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
      appDebugLog(
        'Library',
        `OK-hold enabled (GamepadManager ${
          NativeModules.GamepadManager?.setCenterLongPressEnabled
            ? 'present'
            : 'missing'
        })`,
      );
      NativeModules.GamepadManager?.setCenterLongPressEnabled?.(true);
      const sub = DeviceEventEmitter.addListener(
        'onDpadCenterLongPress',
        () => {
          const key = focusedKeyRef.current;
          const item = key
            ? sortedRef.current.find(entry => entry.key === key)
            : undefined;
          appDebugLog(
            'Library',
            `OK held: focused=${key ?? 'none'} found=${item ? 'yes' : 'no'}`,
          );
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

  // Next order after the current one, wrapping around (TV sort button).
  const cycleSort = React.useCallback(() => {
    const at = sortOptions.findIndex(o => o.value === sortMode);
    setSortMode(sortOptions[(at + 1) % sortOptions.length].value);
  }, [sortOptions, sortMode, setSortMode]);

  const toggleFavoriteRef = React.useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;
  const toggleWishlistRef = React.useRef(toggleWishlist);
  toggleWishlistRef.current = toggleWishlist;
  const stableToggleFavorite = React.useCallback(
    (item: CatalogTitle) => toggleFavoriteRef.current(item),
    [],
  );
  const stableToggleWishlist = React.useCallback(
    (item: CatalogTitle) => toggleWishlistRef.current(item),
    [],
  );

  const renderItem = React.useCallback(
    ({item}: {item: CatalogTitle}) => {
      const Cell = Platform.isTV ? TvTile : GridCard;
      const owned = isCatalogTitleOwned(item);
      return (
        <Cell
          item={item}
          isFocused={focusedKey === item.key}
          discount={saleDiscount(item)}
          numColumns={numColumns}
          inGamePass={isInGamePass(item, gamePassMap)}
          action={owned ? 'favorite' : 'wishlist'}
          actionOn={
            owned ? favoriteKeys.has(item.key) : wishlistKeys.has(item.key)
          }
          onToggleFavorite={stableToggleFavorite}
          onToggleWishlist={stableToggleWishlist}
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
      favoriteKeys,
      wishlistKeys,
      stableToggleFavorite,
      stableToggleWishlist,
      numColumns,
      t,
      stableOpenTitle,
      stableOpenTitleDetail,
      setFocusedKey,
    ],
  );

  // The home tab shows shelves; searching or filtering switches to the grid
  // (a Home tab with a search keyword or filter on is just the full list).
  const showHome =
    libraryTab === 'home' && keyword.trim().length === 0 && filterCount === 0;

  // The view tabs (and, on the phone, the service chips): names written out.
  // The wishlist tab carries the count of wishlisted titles on sale.
  const renderTabs = (withServices: boolean) => (
    <>
      <AppButton
        fill
        label={t('LibraryTabHome')}
        active={libraryTab === 'home'}
        accent={palette.accent}
        onPress={() => selectTab('home')}
      />
      <AppButton
        fill
        label={t('LibraryTabAll')}
        active={libraryTab === 'all'}
        accent={palette.accent}
        onPress={() => selectTab('all')}
      />
      <AppButton
        fill
        label={t('LibraryFilterFavorite')}
        active={libraryTab === 'fav'}
        accent={palette.accent}
        onPress={() => selectTab('fav')}
      />
      <AppButton
        fill
        label={t('LibraryFilterWishlist')}
        active={libraryTab === 'wish'}
        badge={wishlistSaleCount}
        accent={palette.accent}
        onPress={() => selectTab('wish')}
      />
      {withServices && (
        <>
          <View style={styles.chipDivider} />
          <AppButton
            fill
            label={t('LibraryFilterXcloud')}
            active={filterXcloud}
            accent={palette.provider.xbox}
            onPress={() => setFilterXcloud(!filterXcloud)}
          />
          <AppButton
            fill
            label={t('LibraryFilterGfn')}
            active={filterGfn}
            accent={palette.provider.gfn}
            onPress={() => setFilterGfn(!filterGfn)}
          />
          <AppButton
            fill
            label={t('LibraryFilterPsPlus')}
            active={filterPsPlus}
            accent={palette.provider.ps}
            onPress={() => setFilterPsPlus(!filterPsPlus)}
          />
        </>
      )}
    </>
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
          {gfnFullCatalogLoading && (
            <InlineSpinner size={12} color={palette.textSoft} />
          )}
        </View>
        {Platform.isTV ? (
          <>
            <View style={styles.toolbarRow}>
              <AppButton
                icon="magnify"
                label={keyword ? `${t('Search')}: ${keyword}` : t('Search')}
                active={keyword.length > 0}
                accent={palette.accent}
                fill
                onPress={() => setTvSearchOpen(true)}
              />
              <AppButton
                icon="tune"
                label={t('LibraryFilterTitle')}
                active={filterCount > 0}
                badge={filterCount}
                accent={palette.accent}
                fill
                onPress={() => setFilterOpen(true)}
              />
              {/* The current order is written out, and each press moves to
                  the next one (no dropdown to pick from with a remote). */}
              <AppButton
                icon="sort"
                label={`${t('Sort')}: ${activeSortLabel}`}
                active={sortMode !== 'recent'}
                accent={palette.accent}
                fill
                onPress={cycleSort}
              />
              <View style={styles.toolbarGap} />
              {/* TV has no pull-to-refresh gesture: same refresh, as a button. */}
              <AppButton
                iconOnly
                icon="refresh"
                label={refreshing ? t('Loading...') : t('Refresh')}
                accent={palette.accent}
                onPress={() => {
                  if (!refreshing) {
                    onRefresh();
                  }
                }}
              />
            </View>
            <View style={styles.tabsRow}>{renderTabs(false)}</View>
            <TvSearchModal
              visible={tvSearchOpen}
              value={keyword}
              onChangeText={setKeyword}
              onClose={() => setTvSearchOpen(false)}
              placeholder={t('Search')}
              closeLabel={t('Close')}
            />
          </>
        ) : (
          <>
            <View style={styles.phoneSearchRow}>
              <View style={styles.phoneSearchBox}>
                <SearchField
                  value={keyword}
                  onChangeText={setKeyword}
                  placeholder={t('Search')}
                  clearLabel={t('Close')}
                />
              </View>
              <AppButton
                iconOnly
                compact
                icon="tune"
                badge={filterCount}
                label={t('LibraryFilterTitle')}
                active={filterCount > 0}
                accent={palette.accent}
                fill
                onPress={() => setFilterOpen(true)}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {renderTabs(true)}
            </ScrollView>
          </>
        )}
        <LibraryFilterSheet
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          t={t}
          isTV={Platform.isTV}
          showServices={Platform.isTV}
          filterXcloud={filterXcloud}
          setFilterXcloud={setFilterXcloud}
          filterGfn={filterGfn}
          setFilterGfn={setFilterGfn}
          filterPsPlus={filterPsPlus}
          setFilterPsPlus={setFilterPsPlus}
          showOwnership={libraryTab !== 'wish'}
          ownership={filterOwnership}
          setOwnership={setFilterOwnership}
          filterOnSale={filterOnSale}
          setFilterOnSale={setFilterOnSale}
          filterCatalog={filterCatalog}
          toggleCatalog={toggleCatalog}
          onReset={resetFilters}
        />
        {!Platform.isTV && (
          <View style={styles.filterRow}>
            <View style={styles.sortRow}>
              <Text style={styles.count}>{filtered.length}</Text>
              <View style={styles.titleSpacer} />
              <AppButton
                iconOnly
                compact
                icon="sort"
                trailingIcon={sortMenuOpen ? 'chevron-up' : 'chevron-down'}
                label={`${t('Sort')}: ${activeSortLabel}`}
                active={sortMode !== 'recent'}
                accent={palette.accent}
                fill
                onPress={() => setSortMenuOpen(v => !v)}
              />
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
                        <Icon
                          source="check"
                          size={13}
                          color={palette.provider.gfn}
                        />
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
        )}
      </View>

      {catalog.length === 0 ? (
        <View style={styles.centre}>
          <InlineSpinner />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : showHome ? (
        <LibraryHome
          t={t}
          shelves={homeShelves}
          gamePassMap={gamePassMap}
          saleDiscount={saleDiscount}
          openTitle={stableOpenTitle}
          openTitleDetail={stableOpenTitleDetail}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
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
  count: {fontSize: 12, fontWeight: '700', color: palette.textSoft},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: alpha(palette.text, 0.14),
    // Constant width (only the color changes on focus) so gaining a focus
    // ring never shifts this box's size the way the 1px->2px jump on the
    // filter chips below does.
    borderWidth: 2,
    borderColor: alpha(palette.text, 0.24),
  },
  // TextInput has no onPress, so this was invisible to
  // scripts/check-tv-focus.js's static check and had no focus indicator at
  // all until this -- see Google TV's focus-system guide's Outline + Color
  // indications (developer.android.com/design/ui/tv/guides/styles/focus-system).
  searchBoxFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: alpha(palette.focusRing, 0.1),
  },
  searchInput: {flex: 1, padding: 0, fontSize: 14, color: palette.text},
  // TV: the search box above collapses to this AppButton -- same shape as
  // the filter chips below it (icon + label, not an icon-only square) so
  // Android's own per-view focus highlight has the same exposed mat area to
  // land on, instead of the thin 2px-border-only cue a small icon button
  // gave it before. alignSelf keeps it content-sized -- `header`'s a column
  // flex container, which would otherwise stretch a bare AppButton (no
  // explicit width of its own) to the header's full width.
  tvSearchOverlay: {
    flex: 1,
    backgroundColor: alpha(palette.scrim, 0.72),
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
    backgroundColor: palette.surfaceHigh,
    // Plain until the input itself actually has focus -- this used to be a
    // permanent TV_FOCUS_COLOR border regardless of real focus state, which
    // made it look focused even when, say, the close button had the
    // remote's attention instead.
    borderWidth: 2,
    borderColor: alpha(palette.text, 0.3),
  },
  tvSearchBoxFocused: {
    borderColor: TV_FOCUS_COLOR,
  },
  tvSearchInput: {flex: 1, padding: 0, fontSize: 18, color: palette.text},
  tvSearchCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.text, 0.18),
  },
  filterRow: {position: 'relative'},
  toolbarRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  toolbarGap: {flex: 1},
  tabsRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sortRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  chipDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 2,
    backgroundColor: alpha(palette.text, 0.24),
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  // TV only -- pushes the sort AppButton to the row's far end, same as
  // phone's sortChip's own marginLeft:'auto'.
  sortChipTv: {marginLeft: 'auto'},
  titleSpacer: {flex: 1},
  phoneSearchRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  phoneSearchBox: {flex: 1, height: 36, borderRadius: 12},
  searchClear: {padding: 2, borderRadius: 999},
  searchCancel: {paddingHorizontal: 6, paddingVertical: 8, borderRadius: 8},
  searchCancelText: {fontSize: 13, fontWeight: '700', color: palette.textSoft},
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    width: 230,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: palette.elevation.l3,
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.24),
    zIndex: 10,
    elevation: 10,
  },
  sortItem: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: alpha(palette.text, 0.16),
    gap: 2,
  },
  sortItemLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 5},
  sortItemLabel: {fontSize: 13, fontWeight: '700'},
  sortItemScope: {fontSize: 10, color: palette.textSoft, paddingLeft: 18},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  centreText: {color: palette.textSoft, fontSize: 14},
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
    backgroundColor: alpha(palette.text, 0.14),
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
    color: palette.textSoft,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Grays out the cover art (not the badges) when the title isn't playable
  // via any of its listed services right now.
  coverDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(palette.scrim, 0.8),
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '28%',
    backgroundColor: alpha(palette.black, 0.55),
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
  availDotText: {fontSize: 7.5, fontWeight: '800', color: palette.onAccent},
  saleBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: palette.sale,
  },
  saleBadgeText: {fontSize: 8.5, fontWeight: '800', color: palette.onAccent},
  cardAction: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.black, 0.6),
    borderWidth: 1,
    borderColor: alpha(palette.white, 0.1),
  },
  cardTitleWithAction: {right: 44},
  cardTitle: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    fontSize: 10.5,
    fontWeight: '700',
    color: palette.white,
    textShadowColor: alpha(palette.black, 0.6),
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
    backgroundColor: alpha(palette.focusRing, 0.12),
  },
  tvArt: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: alpha(palette.text, 0.14),
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
    borderTopColor: alpha(palette.white, 0.08),
  },
  tvHintText: {fontSize: 13, color: palette.textSoft},
  tvHintKey: {fontWeight: '800', color: palette.text},
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
