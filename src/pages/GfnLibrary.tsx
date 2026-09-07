import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  TextInput,
  Platform,
  Pressable,
  Modal,
  Linking,
  useWindowDimensions,
} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation} from '@react-navigation/native';
import {
  GfnGame,
  fetchGfnGames,
  getFreshGfnGames,
  getCachedGfnGames,
} from '../gfn/publicGames';
import {
  GfnDeviceChallenge,
  requestDeviceAuthorization,
  pollForTokens,
  isSignedIn,
  clearStoredTokens,
  getValidGfnJwt,
} from '../gfn/auth';
import {
  fetchGfnOwnedGames,
  getFreshOwnedGames,
  clearOwnedGames,
  mergeOwnedGames,
} from '../gfn/catalog';

const ACCENT = '#76B900'; // NVIDIA green

// GeForce NOW catalog — a separate library from xCloud. Lists the public
// supported-games list; tapping a card (once signed in) launches the title via
// CloudMatch + WebRTC on the GfnStream screen.
function GfnLibraryScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const [games, setGames] = React.useState<GfnGame[]>(
    () => getCachedGfnGames() || [],
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const [ownedGames, setOwnedGames] = React.useState<GfnGame[]>(
    () => getFreshOwnedGames() || [],
  );
  const [ownedOnly, setOwnedOnly] = React.useState(false);

  const [signedIn, setSignedIn] = React.useState(() => isSignedIn());
  const [loginVisible, setLoginVisible] = React.useState(false);
  const [challenge, setChallenge] = React.useState<GfnDeviceChallenge | null>(
    null,
  );
  // 'starting' while requesting the code, 'waiting' while polling, 'failed' on error.
  const [loginStatus, setLoginStatus] = React.useState<
    'starting' | 'waiting' | 'failed'
  >('starting');
  const cancelledRef = React.useRef(false);

  const startLogin = React.useCallback(async () => {
    cancelledRef.current = false;
    setChallenge(null);
    setLoginStatus('starting');
    setLoginVisible(true);
    try {
      const ch = await requestDeviceAuthorization();
      if (cancelledRef.current) {
        return;
      }
      setChallenge(ch);
      setLoginStatus('waiting');
      await pollForTokens(ch, {shouldCancel: () => cancelledRef.current});
      if (cancelledRef.current) {
        return;
      }
      setSignedIn(true);
      setLoginVisible(false);
    } catch (e: any) {
      if (cancelledRef.current || e?.message === 'cancelled') {
        return;
      }
      setLoginStatus('failed');
    }
  }, []);

  const cancelLogin = React.useCallback(() => {
    cancelledRef.current = true;
    setLoginVisible(false);
  }, []);

  const signOut = React.useCallback(() => {
    clearStoredTokens();
    clearOwnedGames();
    setOwnedGames([]);
    setOwnedOnly(false);
    setSignedIn(false);
  }, []);

  // Fetch the signed-in user's owned library (for the Owned filter + to surface
  // account-linked titles the public list omits).
  const loadOwned = React.useCallback(async () => {
    const token = await getValidGfnJwt();
    if (!token) {
      return;
    }
    try {
      const owned = await fetchGfnOwnedGames(token);
      if (owned.length > 0) {
        setOwnedGames(owned);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (signedIn) {
      loadOwned();
    }
  }, [signedIn, loadOwned]);

  const launchGame = React.useCallback(
    (game: GfnGame) => {
      if (!isSignedIn()) {
        startLogin();
        return;
      }
      // The public catalog id is the numeric CloudMatch app id. Launch through
      // the shared NativeStream screen (streamType 'gfn') so GFN reuses the full
      // xCloud play UI: virtual gamepad, layout editor, controllers, options.
      navigation.navigate('NativeStream', {
        streamType: 'gfn',
        appId: game.id,
        title: game.title,
      });
    },
    [navigation, startLogin],
  );

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

  // The public catalog with owned titles merged in (matches marked owned, and
  // account-linked titles the public list omits appended).
  const allGames = React.useMemo(
    () => mergeOwnedGames(games, ownedGames),
    [games, ownedGames],
  );
  const ownedCount = React.useMemo(
    () => allGames.filter(g => g.owned).length,
    [allGames],
  );

  const filtered = React.useMemo(() => {
    let list = ownedOnly ? allGames.filter(g => g.owned) : allGames;
    const q = keyword.trim().toLowerCase();
    if (q) {
      list = list.filter(g => g.title.toLowerCase().includes(q));
    }
    return list;
  }, [allGames, ownedOnly, keyword]);

  const renderCard = ({item}: {item: GfnGame}) => (
    <View style={[styles.cell, {width: `${100 / numColumns}%`}]}>
      <Pressable
        style={styles.card}
        onPress={() => launchGame(item)}
        android_ripple={{color: 'rgba(118,185,0,0.15)'}}>
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
          {item.owned && (
            <View style={styles.ownedBadge}>
              <Icon source="check-decagram" size={14} color={ACCENT} />
            </View>
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Icon source="gamepad-variant" size={22} color={ACCENT} />
          <Text style={styles.brand}>GeForce NOW</Text>
          {allGames.length > 0 && (
            <Text style={styles.count}>
              {filtered.length}/{allGames.length}
            </Text>
          )}
          <View style={styles.headerSpacer} />
          {signedIn ? (
            <Pressable
              onPress={signOut}
              style={styles.authChip}
              android_ripple={{color: 'rgba(150,150,150,0.15)'}}>
              <Icon source="account-check" size={15} color={ACCENT} />
              <Text style={styles.authChipText}>{t('GfnSignOut')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={startLogin}
              style={[styles.authChip, styles.authChipPrimary]}
              android_ripple={{color: 'rgba(0,0,0,0.15)'}}>
              <Icon source="login-variant" size={15} color="#0B0F0C" />
              <Text style={styles.authChipTextPrimary}>{t('GfnSignIn')}</Text>
            </Pressable>
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
        {signedIn && ownedCount > 0 && (
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setOwnedOnly(false)}
              style={[styles.filterChip, !ownedOnly && styles.filterChipOn]}>
              <Text
                style={[
                  styles.filterChipText,
                  !ownedOnly && styles.filterChipTextOn,
                ]}>
                {t('GfnAllGames')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOwnedOnly(true)}
              style={[styles.filterChip, ownedOnly && styles.filterChipOn]}>
              <Icon
                source="check-decagram"
                size={14}
                color={ownedOnly ? '#0B0F0C' : ACCENT}
              />
              <Text
                style={[
                  styles.filterChipText,
                  ownedOnly && styles.filterChipTextOn,
                ]}>
                {t('GfnOwned')} ({ownedCount})
              </Text>
            </Pressable>
          </View>
        )}
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

      <Modal
        visible={loginVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelLogin}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {backgroundColor: theme.colors.elevation?.level3 || '#1b201d'},
            ]}>
            <View style={styles.modalHeader}>
              <Icon source="gamepad-variant" size={20} color={ACCENT} />
              <Text style={styles.modalTitle}>{t('GfnLoginTitle')}</Text>
            </View>

            {loginStatus === 'starting' ? (
              <View style={styles.modalCentre}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : loginStatus === 'failed' ? (
              <View style={styles.modalCentre}>
                <Icon source="alert-circle-outline" size={34} color="#E06666" />
                <Text style={styles.modalMsg}>{t('GfnLoginFailed')}</Text>
                <Pressable
                  onPress={startLogin}
                  style={[styles.modalBtn, styles.modalBtnPrimary]}>
                  <Text style={styles.modalBtnTextPrimary}>{t('Retry')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.modalInstruction}>
                  {t('GfnLoginInstruction')}
                </Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{challenge?.userCode}</Text>
                </View>
                <Pressable
                  onPress={() =>
                    challenge &&
                    Linking.openURL(challenge.verificationUriComplete)
                  }
                  style={[styles.modalBtn, styles.modalBtnPrimary]}>
                  <Icon source="open-in-new" size={16} color="#0B0F0C" />
                  <Text style={styles.modalBtnTextPrimary}>
                    {t('GfnLoginOpen')}
                  </Text>
                </Pressable>
                <View style={styles.waitingRow}>
                  <ActivityIndicator size={14} color="#8A9A92" />
                  <Text style={styles.waitingText}>{t('GfnLoginWaiting')}</Text>
                </View>
              </>
            )}

            <Pressable onPress={cancelLogin} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>{t('Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10},
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  brand: {fontSize: 18, fontWeight: '800'},
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A9A92',
  },
  headerSpacer: {flex: 1},
  authChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.5)',
    backgroundColor: 'rgba(118,185,0,0.12)',
  },
  authChipPrimary: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  authChipText: {color: ACCENT, fontSize: 12, fontWeight: '800'},
  authChipTextPrimary: {color: '#0B0F0C', fontSize: 12, fontWeight: '800'},
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
  filterRow: {flexDirection: 'row', gap: 8},
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.5)',
  },
  filterChipOn: {backgroundColor: ACCENT, borderColor: ACCENT},
  filterChipText: {color: ACCENT, fontSize: 12, fontWeight: '800'},
  filterChipTextOn: {color: '#0B0F0C'},
  ownedBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,14,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.6)',
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  modalHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  modalTitle: {fontSize: 16, fontWeight: '800'},
  modalCentre: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  modalMsg: {color: '#B7C6BD', fontSize: 14, textAlign: 'center'},
  modalInstruction: {color: '#B7C6BD', fontSize: 13, lineHeight: 19},
  codeBox: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(118,185,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(118,185,0,0.4)',
  },
  codeText: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 6,
    color: '#E6ECE8',
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
  },
  modalBtnPrimary: {backgroundColor: ACCENT},
  modalBtnText: {color: '#8A9A92', fontSize: 14, fontWeight: '700'},
  modalBtnTextPrimary: {color: '#0B0F0C', fontSize: 14, fontWeight: '800'},
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waitingText: {color: '#8A9A92', fontSize: 13},
});

export default GfnLibraryScreen;
