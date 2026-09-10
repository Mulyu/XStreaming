import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  TextInput,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation, useRoute} from '@react-navigation/native';
import {useSelector} from 'react-redux';
import XcloudApi from '../xCloud';
import {
  GfnGame,
  fetchGfnGames,
  getFreshGfnGames,
  getCachedGfnGames,
} from '../gfn/publicGames';
import {isSignedIn, getValidGfnJwt} from '../gfn/auth';
import {
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  mergeOwnedGames,
} from '../gfn/catalog';
import {buildUnifiedCatalog, CatalogTitle} from '../catalog/unifiedCatalog';
import {getCatalogPreference} from '../store/catalogPreferences';
import {
  launchWithProvider,
  isPreferenceAvailable,
} from '../catalog/launchCatalogTitle';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const DIM_ACCENT = 'rgba(140,140,150,0.25)';
const DIM_TEXT = '#5C636A';

// The single "Library" tab: xCloud and GeForce NOW titles merged by name into
// one grid. A title with entries on both services still gets one card; which
// provider (and, for GFN, which linked store) to actually play it on is
// decided on the title's own detail screen, not here.
function LibraryScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const streamingTokens = useSelector((state: any) => state.streamingTokens);

  const [xcloudTitles, setXcloudTitles] = React.useState<any[]>([]);
  const [gfnPublicGames, setGfnPublicGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );
  const [gfnOwnedGames, setGfnOwnedGames] = React.useState<GfnGame[]>(
    () => getFreshOwnedGames() || [],
  );
  const [loading, setLoading] = React.useState(true);
  const [keyword, setKeyword] = React.useState('');

  React.useEffect(() => {
    if (typeof route.params?.keyword === 'string') {
      setKeyword(route.params.keyword);
    }
  }, [route.params?.keyword]);

  // xCloud: title list + Game Pass entitlement. Deliberately not the full
  // Cloud.tsx pipeline (popularity/rating/release-date/leaving-soon) -- this
  // grid only needs enough to show a card and hand off to TitleDetail.
  React.useEffect(() => {
    if (!streamingTokens?.xCloudToken) {
      return;
    }
    const api = new XcloudApi(
      streamingTokens.xCloudToken.getDefaultRegion().baseUri,
      streamingTokens.xCloudToken.data.gsToken,
      'cloud',
    );
    api.getTitles().then((res: any) => {
      if (res?.results?.length > 0) {
        api.getGamePassProducts(res.results).then(setXcloudTitles);
      }
    });
  }, [streamingTokens?.xCloudToken]);

  // GFN: public catalog (no sign-in needed) + the signed-in user's owned
  // library merged in, exactly as GfnLibrary did.
  const loadGfnPublic = React.useCallback((force = false) => {
    if (!force) {
      const fresh = getFreshGfnGames();
      if (fresh) {
        setGfnPublicGames(fresh);
        return;
      }
    }
    fetchGfnGames()
      .then(setGfnPublicGames)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    loadGfnPublic();
  }, [loadGfnPublic]);

  React.useEffect(() => {
    if (!isSignedIn()) {
      return;
    }
    getValidGfnJwt().then(token => {
      if (!token) {
        return;
      }
      fetchGfnOwnedGames(token)
        .then(owned => owned.length > 0 && setGfnOwnedGames(owned))
        .catch(() => {});
    });
  }, []);

  React.useEffect(() => {
    // Nothing to actually await -- both fetches above resolve independently
    // and paint as they arrive. This just clears the initial spinner once
    // we've had a chance to show cached GFN data (xCloud may still be
    // loading quietly in the background if this is the very first fetch).
    setLoading(false);
  }, []);

  const gfnGames = React.useMemo(
    () => mergeOwnedGames(gfnPublicGames, gfnOwnedGames),
    [gfnPublicGames, gfnOwnedGames],
  );

  const catalog = React.useMemo(
    () => buildUnifiedCatalog(xcloudTitles, gfnGames),
    [xcloudTitles, gfnGames],
  );

  const filtered = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) {
      return catalog;
    }
    return catalog.filter(item => item.title.toLowerCase().includes(q));
  }, [catalog, keyword]);

  const isLandscape = screenWidth > screenHeight;
  const numColumns = React.useMemo(() => {
    const target = isLandscape || Platform.isTV ? 300 : 260;
    return Math.max(1, Math.min(6, Math.floor(screenWidth / target)));
  }, [isLandscape, screenWidth]);

  const openTitle = React.useCallback(
    (item: CatalogTitle) => {
      const preference = getCatalogPreference(item.key);
      if (preference && isPreferenceAvailable(item, preference)) {
        launchWithProvider(navigation, item, preference);
        return;
      }
      navigation.navigate('LibraryTitleDetail', {catalogTitle: item});
    },
    [navigation],
  );

  const renderCard = ({item}: {item: CatalogTitle}) => (
    <View style={[styles.cell, {width: `${100 / numColumns}%`}]}>
      <Pressable
        style={styles.card}
        onPress={() => openTitle(item)}
        android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
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
        </View>
        <View style={styles.cardFoot}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.availRow}>
            {item.xcloud && (
              <View
                style={[
                  styles.availDot,
                  {
                    backgroundColor: item.xcloud.hasEntitlement
                      ? XBOX_ACCENT
                      : DIM_ACCENT,
                  },
                ]}>
                <Text
                  style={[
                    styles.availDotText,
                    !item.xcloud.hasEntitlement && {color: DIM_TEXT},
                  ]}>
                  X
                </Text>
              </View>
            )}
            {item.gfn && (
              <View
                style={[
                  styles.availDot,
                  {
                    backgroundColor: item.gfn.variants.some(v => v.owned)
                      ? NVIDIA_ACCENT
                      : DIM_ACCENT,
                  },
                ]}>
                <Text
                  style={[
                    styles.availDotText,
                    !item.gfn.variants.some(v => v.owned) && {
                      color: DIM_TEXT,
                    },
                  ]}>
                  N
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('Library')}</Text>
          {catalog.length > 0 && (
            <Text style={styles.count}>
              {filtered.length}/{catalog.length}
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

      {loading && catalog.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={styles.centreText}>{t('Loading...')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={item => item.key}
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
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10},
  centreText: {color: '#8A9A92', fontSize: 14},
  list: {paddingHorizontal: 6, paddingBottom: 20},
  cell: {padding: 6},
  card: {gap: 6},
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
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
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardTitle: {fontSize: 12, fontWeight: '600', flex: 1},
  availRow: {flexDirection: 'row', gap: 3},
  availDot: {
    width: 15,
    height: 15,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availDotText: {fontSize: 8, fontWeight: '800', color: '#0B0F0C'},
});

export default LibraryScreen;
