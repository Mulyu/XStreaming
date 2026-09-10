import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Modal,
  Linking,
  ScrollView,
} from 'react-native';
import {Text, Icon, ActivityIndicator, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation, useRoute} from '@react-navigation/native';
import {
  GfnDeviceChallenge,
  requestDeviceAuthorization,
  pollForTokens,
  isSignedIn,
} from '../gfn/auth';
import {CatalogTitle} from '../catalog/unifiedCatalog';
import {getCatalogPreference} from '../store/catalogPreferences';
import {launchWithProvider} from '../catalog/launchCatalogTitle';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';

// A title's detail screen: "Play on" lists every provider it's actually
// available through, and -- for GeForce NOW, where the same game can be
// linked to more than one store -- expands into the store choices once
// there's more than one. Picking any of them remembers the choice for the
// Library grid's next tap on this title.
function LibraryTitleDetailScreen() {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const catalogTitle: CatalogTitle = route.params?.catalogTitle;

  const [gfnExpanded, setGfnExpanded] = React.useState(
    () => (catalogTitle?.gfn?.variants.length ?? 0) <= 1,
  );
  const [loginVisible, setLoginVisible] = React.useState(false);
  const [challenge, setChallenge] = React.useState<GfnDeviceChallenge | null>(
    null,
  );
  const [loginStatus, setLoginStatus] = React.useState<
    'starting' | 'waiting' | 'failed'
  >('starting');
  const cancelledRef = React.useRef(false);
  const pendingLaunchRef = React.useRef<(() => void) | null>(null);

  const preference = React.useMemo(
    () => (catalogTitle ? getCatalogPreference(catalogTitle.key) : null),
    [catalogTitle],
  );

  const startLogin = React.useCallback((onSignedIn?: () => void) => {
    pendingLaunchRef.current = onSignedIn ?? null;
    cancelledRef.current = false;
    setChallenge(null);
    setLoginStatus('starting');
    setLoginVisible(true);
    requestDeviceAuthorization()
      .then(ch => {
        if (cancelledRef.current) {
          return;
        }
        setChallenge(ch);
        setLoginStatus('waiting');
        return pollForTokens(ch, {shouldCancel: () => cancelledRef.current});
      })
      .then(() => {
        if (cancelledRef.current) {
          return;
        }
        setLoginVisible(false);
        pendingLaunchRef.current?.();
      })
      .catch((e: any) => {
        if (cancelledRef.current || e?.message === 'cancelled') {
          return;
        }
        setLoginStatus('failed');
      });
  }, []);

  const cancelLogin = React.useCallback(() => {
    cancelledRef.current = true;
    setLoginVisible(false);
  }, []);

  if (!catalogTitle) {
    return null;
  }

  const playXcloud = () => {
    launchWithProvider(navigation, catalogTitle, {provider: 'xcloud'});
  };

  const playGfnVariant = (variant: {id: string; store: string}) => {
    const launch = () =>
      launchWithProvider(navigation, catalogTitle, {
        provider: 'gfn',
        store: variant.store,
        gfnId: variant.id,
      });
    if (!isSignedIn()) {
      startLogin(launch);
      return;
    }
    launch();
  };

  const gfnVariants = catalogTitle.gfn?.variants ?? [];
  const isPreferredXcloud = preference?.provider === 'xcloud';
  const isPreferredGfnVariant = (id: string, store: string) =>
    preference?.provider === 'gfn' &&
    preference.gfnId === id &&
    preference.store === store;

  return (
    <ScrollView
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {catalogTitle.imageUrl ? (
          <Image
            source={{uri: catalogTitle.imageUrl}}
            resizeMode="cover"
            style={styles.heroImage}
          />
        ) : null}
        <View style={styles.heroOverlay}>
          <Text style={styles.heroTitle}>{catalogTitle.title}</Text>
          {catalogTitle.genres.length > 0 && (
            <Text style={styles.heroMeta}>
              {catalogTitle.genres.slice(0, 3).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>{t('PlayOn')}</Text>

        {catalogTitle.xcloud && (
          <View style={styles.providerCard}>
            <Pressable style={styles.providerRow} onPress={playXcloud}>
              <View style={[styles.providerIcon, styles.xcloudIconBg]}>
                <Text style={[styles.providerIconText, {color: XBOX_ACCENT}]}>
                  X
                </Text>
              </View>
              <View style={styles.providerText}>
                <Text style={styles.providerName}>Xbox Cloud Gaming</Text>
                <Text style={styles.providerSub}>
                  {catalogTitle.xcloud.hasEntitlement
                    ? t('IncludedWithGamePass')
                    : t('LibraryViewDetails')}
                </Text>
              </View>
              {isPreferredXcloud && (
                <Icon source="check-circle" size={18} color={XBOX_ACCENT} />
              )}
              <Icon source="chevron-right" size={18} color="#8A9A92" />
            </Pressable>
          </View>
        )}

        {catalogTitle.gfn && (
          <View style={styles.providerCard}>
            <Pressable
              style={styles.providerRow}
              onPress={() =>
                gfnVariants.length > 1
                  ? setGfnExpanded(v => !v)
                  : playGfnVariant(gfnVariants[0])
              }>
              <View style={[styles.providerIcon, styles.gfnIconBg]}>
                <Text style={[styles.providerIconText, {color: NVIDIA_ACCENT}]}>
                  N
                </Text>
              </View>
              <View style={styles.providerText}>
                <Text style={styles.providerName}>GeForce NOW</Text>
                <Text style={styles.providerSub}>
                  {gfnVariants.length > 1
                    ? t('LibraryStoreCount', {n: gfnVariants.length})
                    : gfnVariants[0]?.store}
                </Text>
              </View>
              {preference?.provider === 'gfn' && (
                <Icon source="check-circle" size={18} color={NVIDIA_ACCENT} />
              )}
              <Icon
                source={
                  gfnVariants.length > 1
                    ? gfnExpanded
                      ? 'chevron-up'
                      : 'chevron-down'
                    : 'chevron-right'
                }
                size={18}
                color="#8A9A92"
              />
            </Pressable>

            {gfnVariants.length > 1 && gfnExpanded && (
              <View style={styles.stores}>
                {gfnVariants.map(variant => (
                  <Pressable
                    key={`${variant.store}:${variant.id}`}
                    style={styles.storeRow}
                    onPress={() => playGfnVariant(variant)}>
                    <View style={styles.storeMark}>
                      <Text style={styles.storeMarkText}>
                        {variant.store.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.storeName}>{variant.store}</Text>
                    <View style={styles.storeRowEnd}>
                      {variant.owned && (
                        <Text style={styles.ownedText}>{t('GfnOwned')}</Text>
                      )}
                      {isPreferredGfnVariant(variant.id, variant.store) && (
                        <Icon
                          source="check-circle"
                          size={16}
                          color={NVIDIA_ACCENT}
                        />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {preference && (
          <Text style={styles.rememberedNote}>{t('RememberedChoice')}</Text>
        )}
      </View>

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
              <Icon source="gamepad-variant" size={20} color={NVIDIA_ACCENT} />
              <Text style={styles.modalTitle}>{t('GfnLoginTitle')}</Text>
            </View>

            {loginStatus === 'starting' ? (
              <View style={styles.modalCentre}>
                <ActivityIndicator color={NVIDIA_ACCENT} />
              </View>
            ) : loginStatus === 'failed' ? (
              <View style={styles.modalCentre}>
                <Icon source="alert-circle-outline" size={34} color="#E06666" />
                <Text style={styles.modalMsg}>{t('GfnLoginFailed')}</Text>
                <Pressable
                  onPress={() =>
                    startLogin(pendingLaunchRef.current ?? undefined)
                  }
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingBottom: 32},
  hero: {aspectRatio: 16 / 9, justifyContent: 'flex-end'},
  heroImage: {...StyleSheet.absoluteFillObject},
  heroOverlay: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTitle: {fontSize: 22, fontWeight: '800', color: '#fff'},
  heroMeta: {fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2},
  body: {padding: 16, gap: 12},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A9A92',
  },
  providerCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(140,140,150,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.2)',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  providerIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xcloudIconBg: {backgroundColor: 'rgba(16,124,16,0.18)'},
  gfnIconBg: {backgroundColor: 'rgba(118,185,0,0.18)'},
  providerIconText: {fontWeight: '800', fontSize: 13},
  providerText: {flex: 1, gap: 1},
  providerName: {fontSize: 14, fontWeight: '700'},
  providerSub: {fontSize: 11.5, color: '#8A9A92'},
  stores: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(140,140,150,0.2)',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 22,
  },
  storeMark: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(140,140,150,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMarkText: {fontSize: 9, fontWeight: '800', color: '#8A9A92'},
  storeName: {flex: 1, fontSize: 13, fontWeight: '600'},
  storeRowEnd: {flexDirection: 'row', alignItems: 'center', gap: 6},
  ownedText: {fontSize: 11, fontWeight: '700', color: NVIDIA_ACCENT},
  rememberedNote: {fontSize: 11.5, color: '#8A9A92', textAlign: 'center'},
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
  modalBtnPrimary: {backgroundColor: NVIDIA_ACCENT},
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

export default LibraryTitleDetailScreen;
