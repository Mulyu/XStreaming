import React from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {Text} from 'react-native-paper';
import {
  CatalogTitle,
  isInGamePass,
  providerBadges,
  providerStatuses,
  PROVIDER_KEYS,
  PROVIDER_NAMES,
} from '../../../entities/catalog-title';
import TitleCard from '../../../shared/ui/TitleCard';
import TitleShelf from '../../../shared/ui/TitleShelf';
import TitleSpotlight from '../../../shared/ui/TitleSpotlight';
import {palette} from '../../../shared/config/palette';
import type {LibraryShelves} from '../model/libraryShelves';

type Props = {
  t: (key: string) => string;
  shelves: LibraryShelves;
  gamePassMap: Record<string, true>;
  saleDiscount: (item: CatalogTitle) => number;
  openTitle: (item: CatalogTitle) => void;
  openTitleDetail: (item: CatalogTitle) => void;
  refreshing: boolean;
  onRefresh: () => void;
};

// A title as a cover card on a shelf. Memoised on stable handlers so a focus
// move re-renders only the card that gained or lost it.
const HomeCard = React.memo(function HomeCard({
  item,
  width,
  sale,
  onOpen,
  onOpenDetail,
  onFocusItem,
}: {
  item: CatalogTitle;
  width: number;
  sale: number;
  onOpen: (item: CatalogTitle) => void;
  onOpenDetail: (item: CatalogTitle) => void;
  onFocusItem: (item: CatalogTitle) => void;
}) {
  return (
    <TitleCard
      width={width}
      title={item.title}
      imageUrl={item.imageUrl}
      badges={providerBadges(item)}
      sale={sale > 0 ? `-${sale}%` : undefined}
      onPress={() => onOpen(item)}
      onLongPress={() => onOpenDetail(item)}
      onFocusItem={() => onFocusItem(item)}
    />
  );
});

// The TV's "selected title" panel. Holds the selected title in its own state
// and hands the setter to the screen, so moving focus across the cards
// re-renders only this panel.
const HomeSpotlight = ({
  initial,
  register,
  gamePassMap,
  t,
}: {
  initial: CatalogTitle;
  register: (set: (item: CatalogTitle) => void) => void;
  gamePassMap: Record<string, true>;
  t: (key: string) => string;
}) => {
  const [item, setItem] = React.useState(initial);
  React.useEffect(() => {
    register(setItem);
  }, [register]);
  const statusText: Record<string, string> = {
    owned: t('SpotOwned'),
    catalog: t('SpotIncluded'),
    notOwned: t('SpotNotOwned'),
    none: t('SpotNotAvailable'),
  };
  const statuses = providerStatuses(item, {
    inGamePass: isInGamePass(item, gamePassMap),
  });
  return (
    <TitleSpotlight
      title={item.title}
      imageUrl={item.imageUrl}
      lines={PROVIDER_KEYS.map(key => ({
        color: palette.provider[key],
        on: statuses[key] === 'owned' || statuses[key] === 'catalog',
        text: `${PROVIDER_NAMES[key]} · ${statusText[statuses[key]]}`,
      }))}
      hint={`${t('LibraryTvHintOk')} ${t('LibraryTvHintLaunch')}  ${t(
        'LibraryTvHintOkHold',
      )} ${t('LibraryTvHintDetail')}`}
    />
  );
};

// The Library's landing view: what you played last, your favorites and the
// wishlist titles that are on sale, as shelves of cover cards.
const LibraryHome: React.FC<Props> = ({
  t,
  shelves,
  gamePassMap,
  saleDiscount,
  openTitle,
  openTitleDetail,
  refreshing,
  onRefresh,
}) => {
  const [width, setWidth] = React.useState(0);
  const setter = React.useRef<((item: CatalogTitle) => void) | null>(null);
  const register = React.useCallback((set: (item: CatalogTitle) => void) => {
    setter.current = set;
  }, []);
  const onFocusItem = React.useCallback((item: CatalogTitle) => {
    setter.current?.(item);
  }, []);
  const inner = Math.max(0, width - 28);
  const cardWidth = Platform.isTV
    ? inner
      ? Math.floor(inner / 6.3)
      : 140
    : 132;
  const first =
    shelves.recent[0] ?? shelves.favorites[0] ?? shelves.wishSale[0];

  const renderShelf = (title: string, items: CatalogTitle[]) =>
    items.length > 0 && (
      <TitleShelf title={title}>
        {items.map(item => (
          <HomeCard
            key={item.key}
            item={item}
            width={cardWidth}
            sale={saleDiscount(item)}
            onOpen={openTitle}
            onOpenDetail={openTitleDetail}
            onFocusItem={onFocusItem}
          />
        ))}
      </TitleShelf>
    );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      {Platform.isTV && first && (
        <HomeSpotlight
          initial={first}
          register={register}
          gamePassMap={gamePassMap}
          t={t}
        />
      )}
      {renderShelf(t('LibraryShelfRecent'), shelves.recent)}
      {renderShelf(t('LibraryFilterFavorite'), shelves.favorites)}
      {renderShelf(t('LibraryShelfWishSale'), shelves.wishSale)}
      {!first && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('LibraryHomeEmpty')}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {paddingHorizontal: 14, paddingBottom: 24, gap: 14},
  empty: {paddingVertical: 40, alignItems: 'center'},
  emptyText: {fontSize: 13, color: palette.textSoft, textAlign: 'center'},
});

export default LibraryHome;
