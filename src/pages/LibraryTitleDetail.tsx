import React from 'react';
import {StyleSheet, View, Image, Pressable, ScrollView} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useNavigation, useRoute} from '@react-navigation/native';
import {isSignedIn} from '../gfn/auth';
import {useGfnSignIn} from '../gfn/useGfnSignIn';
import GfnSignInModal from '../components/GfnSignInModal';
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
  const {
    loginVisible,
    challenge,
    loginStatus,
    startLogin,
    retryLogin,
    cancelLogin,
  } = useGfnSignIn();

  const preference = React.useMemo(
    () => (catalogTitle ? getCatalogPreference(catalogTitle.key) : null),
    [catalogTitle],
  );

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
  // Cover art grays out when the title isn't playable via any listed
  // service today; the provider row icons below stay full color regardless
  // (they answer "which service", not "playable right now").
  const isPlayable =
    !!catalogTitle.xcloud?.hasEntitlement ||
    gfnVariants.some(variant => variant.owned);
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
        {!isPlayable && <View style={styles.heroDim} pointerEvents="none" />}
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

      <GfnSignInModal
        visible={loginVisible}
        status={loginStatus}
        challenge={challenge}
        onRetry={retryLogin}
        onCancel={cancelLogin}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingBottom: 32},
  hero: {aspectRatio: 16 / 9, justifyContent: 'flex-end'},
  heroImage: {...StyleSheet.absoluteFillObject},
  heroDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,21,24,0.55)',
  },
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
});

export default LibraryTitleDetailScreen;
