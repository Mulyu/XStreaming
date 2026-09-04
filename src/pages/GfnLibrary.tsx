import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  GfnGame,
  fetchGfnGames,
  getFreshGfnGames,
  getCachedGfnGames,
} from '../gfn/publicGames';

const ACCENT = '#76B900'; // NVIDIA green

// GeForce NOW catalog — a separate library from xCloud. For now it lists the
// public supported-games list (no NVIDIA login required); streaming/launch will
// come later once GFN auth + WebRTC are wired up.
function GfnLibraryScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [games, setGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');

  const load = React.useCallback((force = false) => {
    if (!force) {
      const fresh = getFreshGfnGames();
      if (fresh) {
        setGames(fresh);
        return;
      }
    }
    setError(false);
    setLoading(true);
    fetchGfnGames()
      .then(setGames)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const isLandscape = screenWidth > screenHeight;
  const numColumns = React.useMemo(() => {
    const target = isLandscape || Platform.isTV ? 300 : 260;
    return Math.max(1, Math.min(6, Math.floor(screenWidth / target)));
  }, [isLandscape, screenWidth]);

  const filtered = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) {
      return games;
    }
    return games.filter(g => g.title.toLowerCase().includes(q));
  }, [games, keyword]);

  const renderCard = ({item}: {item: GfnGame}) => (
    <View style={[styles.cell, {width: `${100 / numColumns}%`}]}>
      <View style={styles.card}>
        <View style={styles.thumbWrap}>
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
          <View style={styles.storeBadge}>
            <Text style={styles.storeBadgeText}>{item.store}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Icon source="gamepad-variant" size={22} color={ACCENT} />
          <Text style={styles.brand}>GeForce NOW</Text>
          {games.length > 0 && (
            <Text style={styles.count}>
              {filtered.length}/{games.length}
            </Text>
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
      </View>

      {loading && games.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator color={ACCENT} />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : error && games.length === 0 ? (
        <View style={styles.centre}>
          <Icon source="cloud-off-outline" size={40} color="#8A9A92" />
          <Text style={styles.centreText}>{t('GfnLoadFailed')}</Text>
          <Text style={styles.retry} onPress={() => load(true)}>
            {t('Retry')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={g => g.id}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          initialNumToRender={18}
          windowSize={11}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  brand: {fontSize: 18, fontWeight: '800'},
  count: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: '#8A9A92',
  },
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
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  centreText: {color: '#8A9A92', fontSize: 14},
  retry: {color: ACCENT, fontSize: 14, fontWeight: '700', marginTop: 4},
  list: {paddingHorizontal: 6, paddingBottom: 20},
  cell: {padding: 6},
  card: {gap: 6},
  thumbWrap: {
    width: '100%',
    aspectRatio: 460 / 215,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  thumb: {width: '100%', height: '100%'},
  thumbEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  thumbEmptyText: {
    color: '#B7C6BD',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  storeBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(8,14,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.5)',
  },
  storeBadgeText: {color: ACCENT, fontSize: 10, fontWeight: '800'},
  cardTitle: {fontSize: 12, fontWeight: '600'},
});

export default GfnLibraryScreen;
