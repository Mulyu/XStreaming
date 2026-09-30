import React from 'react';
import {StyleSheet, View, Image, Pressable, ScrollView} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {GfnSignInModal} from '../../../entities/gfn-account';
import {
  formatPrice,
  discountPercent,
  isSaleForDisplay,
  getStoreUrl,
  isSteamSaleForDisplay,
} from '../../../entities/catalog-title';
import {
  CAP_META,
  capLabel,
  renderStars,
} from '../../../entities/title-capabilities';
import {getTitleProductId} from '../../../features/launch-title';
import type {LibraryTitleDetailViewModel} from '../model/useLibraryTitleDetail';

const XBOX_ACCENT = '#107C10';
const NVIDIA_ACCENT = '#76B900';
const PS_ACCENT = '#0070D1';
const DIM_ICON_BG = 'rgba(140,140,150,0.16)';
const DIM_TEXT = '#8A9A92';

type Props = LibraryTitleDetailViewModel;

const LibraryTitleDetailView: React.FC<Props> = ({
  t,
  backgroundColor,
  catalogTitle,
  gfnExpanded,
  onToggleGfnExpanded,
  loginVisible,
  challenge,
  loginStatus,
  retryLogin,
  cancelLogin,
  price,
  rating,
  details,
  gfnDetails,
  steamPrices,
  preference,
  isFavorite,
  toggleFavorite,
  playXcloud,
  playPsPlus,
  playGfnVariant,
  canAddShortcut,
  addXcloudShortcut,
  addGfnShortcut,
  openStore,
}) => {
  if (!catalogTitle) {
    return null;
  }

  const gfnVariants = catalogTitle.gfn?.variants ?? [];
  const gfnAnyOwned = gfnVariants.some(variant => variant.owned);
  // Most titles only have one GFN store variant, in which case the per-store
  // list below never renders (tapping the row launches straight away instead
  // of expanding) -- so the sole variant's price and store link need to live
  // on the top-level row itself, not just the multi-variant list.
  const soleGfnVariant = gfnVariants.length === 1 ? gfnVariants[0] : null;
  const soleGfnSteamPrice = soleGfnVariant?.steamAppId
    ? steamPrices[soleGfnVariant.steamAppId]
    : undefined;
  const soleGfnShowSale =
    !!soleGfnVariant &&
    !soleGfnVariant.owned &&
    isSteamSaleForDisplay(soleGfnSteamPrice);
  const isPreferredXcloud = preference?.provider === 'xcloud';
  const isPreferredGfnVariant = (id: string, store: string) =>
    preference?.provider === 'gfn' &&
    preference.gfnId === id &&
    preference.store === store;

  const genres =
    catalogTitle.genres.length > 0
      ? catalogTitle.genres
      : gfnDetails?.genres ?? [];
  const description =
    details?.description ||
    gfnDetails?.longDescription ||
    gfnDetails?.shortDescription ||
    '';
  const developer = details?.developer || gfnDetails?.developerName;
  const publisher = details?.publisher || gfnDetails?.publisherName;
  const screenshots = details?.screenshots?.length
    ? details.screenshots
    : gfnDetails?.screenshots ?? [];
  const trailer = details?.trailers?.[0];
  const hasMedia = !!trailer || screenshots.length > 0;

  const xcloudEntitled = !!catalogTitle.xcloud?.hasEntitlement;
  const xcloudDiscount =
    price && isSaleForDisplay(price) ? discountPercent(price) : 0;
  const xcloudProductId = getTitleProductId(catalogTitle.xcloud?.raw);

  return (
    <ScrollView
      style={[styles.root, {backgroundColor}]}
      contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {catalogTitle.imageUrl ? (
          <Image
            source={{uri: catalogTitle.imageUrl}}
            resizeMode="cover"
            style={styles.heroImage}
          />
        ) : null}
        <Pressable
          style={styles.favoriteBtn}
          onPress={toggleFavorite}
          accessibilityLabel={t('LibraryFilterFavorite')}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite ? '#ff5347' : '#fff'}
          />
        </Pressable>
        <View style={styles.heroOverlay}>
          <Text style={styles.heroTitle}>{catalogTitle.title}</Text>
          {genres.length > 0 && (
            <Text style={styles.heroMeta}>
              {genres.slice(0, 3).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {rating && (
          <View style={styles.ratingRow}>
            <View style={styles.starsRow}>{renderStars(rating.average)}</View>
            <Text style={styles.ratingNum}>{rating.average.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>
              ({rating.count.toLocaleString()})
            </Text>
          </View>
        )}

        {(developer || publisher) && (
          <View style={styles.metaRow}>
            {developer ? (
              <View style={styles.metaCol}>
                <Text style={styles.metaKey}>{t('Developer')}</Text>
                <Text style={styles.metaVal}>{developer}</Text>
              </View>
            ) : null}
            {publisher ? (
              <View style={styles.metaCol}>
                <Text style={styles.metaKey}>{t('Publisher')}</Text>
                <Text style={styles.metaVal}>{publisher}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View>
          <Text style={styles.sectionLabel}>{t('PlayOn')}</Text>

          {catalogTitle.xcloud && (
            <View style={[styles.providerCard, styles.providerCardSpaced]}>
              <Pressable
                style={[styles.providerRow, !xcloudEntitled && styles.dimRow]}
                onPress={playXcloud}>
                <View
                  style={[
                    styles.providerIcon,
                    xcloudEntitled ? styles.xcloudIconBg : styles.dimIconBg,
                  ]}>
                  <Text
                    style={[
                      styles.providerIconText,
                      {color: xcloudEntitled ? XBOX_ACCENT : DIM_TEXT},
                    ]}>
                    X
                  </Text>
                </View>
                <View style={styles.providerText}>
                  <Text style={styles.providerName}>Xbox Cloud Gaming</Text>
                  <Text style={styles.providerSub}>
                    {xcloudEntitled
                      ? t('IncludedWithGamePass')
                      : t('LibraryViewDetails')}
                  </Text>
                  {!xcloudEntitled && price && (
                    <View style={styles.priceRow}>
                      <Text
                        style={[
                          styles.priceNow,
                          xcloudDiscount > 0 && styles.priceNowSale,
                        ]}>
                        {formatPrice(price.listPrice, price.currencyCode)}
                      </Text>
                      {xcloudDiscount > 0 && (
                        <Text style={styles.priceWas}>
                          {formatPrice(price.msrp, price.currencyCode)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                {isPreferredXcloud && (
                  <Icon source="check-circle" size={18} color={XBOX_ACCENT} />
                )}
                {xcloudProductId && (
                  <Pressable
                    style={styles.storeLinkBtn}
                    hitSlop={8}
                    onPress={() => openStore(getStoreUrl(xcloudProductId))}>
                    <Icon source="open-in-new" size={16} color="#8A9A92" />
                  </Pressable>
                )}
                {canAddShortcut && (
                  <Pressable
                    style={styles.storeLinkBtn}
                    hitSlop={8}
                    accessibilityLabel={t('Add to desktop')}
                    onPress={addXcloudShortcut}>
                    <Icon source="plus-box-outline" size={16} color="#8A9A92" />
                  </Pressable>
                )}
                <Icon source="chevron-right" size={18} color="#8A9A92" />
              </Pressable>
            </View>
          )}

          {catalogTitle.gfn && (
            <View style={styles.providerCard}>
              <Pressable
                style={[styles.providerRow, !gfnAnyOwned && styles.dimRow]}
                onPress={() =>
                  gfnVariants.length > 1
                    ? onToggleGfnExpanded()
                    : playGfnVariant(gfnVariants[0])
                }>
                <View
                  style={[
                    styles.providerIcon,
                    gfnAnyOwned ? styles.gfnIconBg : styles.dimIconBg,
                  ]}>
                  <Text
                    style={[
                      styles.providerIconText,
                      {color: gfnAnyOwned ? NVIDIA_ACCENT : DIM_TEXT},
                    ]}>
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
                  {soleGfnVariant &&
                    !soleGfnVariant.owned &&
                    soleGfnSteamPrice && (
                      <View style={styles.priceRow}>
                        <Text
                          style={[
                            styles.priceNow,
                            soleGfnShowSale && styles.priceNowSale,
                          ]}>
                          {formatPrice(
                            soleGfnSteamPrice.final / 100,
                            soleGfnSteamPrice.currencyCode,
                          )}
                        </Text>
                        {soleGfnShowSale && (
                          <Text style={styles.priceWas}>
                            {formatPrice(
                              soleGfnSteamPrice.initial / 100,
                              soleGfnSteamPrice.currencyCode,
                            )}
                          </Text>
                        )}
                      </View>
                    )}
                </View>
                {preference?.provider === 'gfn' && (
                  <Icon source="check-circle" size={18} color={NVIDIA_ACCENT} />
                )}
                {soleGfnVariant?.steamAppId && (
                  <Pressable
                    style={styles.storeLinkBtn}
                    hitSlop={8}
                    onPress={() =>
                      openStore(
                        `https://store.steampowered.com/app/${soleGfnVariant.steamAppId}`,
                      )
                    }>
                    <Icon source="open-in-new" size={16} color="#8A9A92" />
                  </Pressable>
                )}
                {canAddShortcut && soleGfnVariant && (
                  <Pressable
                    style={styles.storeLinkBtn}
                    hitSlop={8}
                    accessibilityLabel={t('Add to desktop')}
                    onPress={() => addGfnShortcut(soleGfnVariant)}>
                    <Icon source="plus-box-outline" size={16} color="#8A9A92" />
                  </Pressable>
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
                  {gfnVariants.map(variant => {
                    const steamPrice = variant.steamAppId
                      ? steamPrices[variant.steamAppId]
                      : undefined;
                    const showSale =
                      !variant.owned && isSteamSaleForDisplay(steamPrice);
                    return (
                      <Pressable
                        key={`${variant.store}:${variant.id}`}
                        style={[
                          styles.storeRow,
                          !variant.owned && styles.dimRow,
                        ]}
                        onPress={() => playGfnVariant(variant)}>
                        <View style={styles.storeMark}>
                          <Text style={styles.storeMarkText}>
                            {variant.store.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.storeText}>
                          <Text style={styles.storeName}>{variant.store}</Text>
                          {!variant.owned && steamPrice && (
                            <View style={styles.priceRow}>
                              <Text
                                style={[
                                  styles.priceNow,
                                  showSale && styles.priceNowSale,
                                ]}>
                                {formatPrice(
                                  steamPrice.final / 100,
                                  steamPrice.currencyCode,
                                )}
                              </Text>
                              {showSale && (
                                <Text style={styles.priceWas}>
                                  {formatPrice(
                                    steamPrice.initial / 100,
                                    steamPrice.currencyCode,
                                  )}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                        <View style={styles.storeRowEnd}>
                          {variant.owned && (
                            <Text style={styles.ownedText}>
                              {t('GfnOwned')}
                            </Text>
                          )}
                          {variant.steamAppId && (
                            <Pressable
                              style={styles.storeLinkBtn}
                              hitSlop={8}
                              onPress={() =>
                                openStore(
                                  `https://store.steampowered.com/app/${variant.steamAppId}`,
                                )
                              }>
                              <Icon
                                source="open-in-new"
                                size={14}
                                color="#8A9A92"
                              />
                            </Pressable>
                          )}
                          {canAddShortcut && (
                            <Pressable
                              style={styles.storeLinkBtn}
                              hitSlop={8}
                              accessibilityLabel={t('Add to desktop')}
                              onPress={() => addGfnShortcut(variant)}>
                              <Icon
                                source="plus-box-outline"
                                size={14}
                                color="#8A9A92"
                              />
                            </Pressable>
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
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {catalogTitle.psplus &&
            (() => {
              // "Owned" (a real purchase/entitlement) and "in the Plus
              // catalog" (streamable at no extra cost purely from the active
              // subscription tier, independent of ever having bought it) are
              // both "playable right now" for this card's purposes -- only
              // neither means the title still needs the user to act
              // (subscribe/buy) before it can stream.
              const psplusAvailable =
                catalogTitle.psplus.isOwned ||
                catalogTitle.psplus.inPlusCatalog;
              const subtitle = catalogTitle.psplus.isOwned
                ? t('LibraryFilterOwned')
                : catalogTitle.psplus.inPlusCatalog
                ? t('PsPlusIncludedDesc')
                : t('LibraryViewDetails');
              return (
                <View style={styles.providerCard}>
                  <Pressable
                    style={[
                      styles.providerRow,
                      !psplusAvailable && styles.dimRow,
                    ]}
                    onPress={playPsPlus}>
                    <View
                      style={[
                        styles.providerIcon,
                        psplusAvailable
                          ? styles.psplusIconBg
                          : styles.dimIconBg,
                      ]}>
                      <Text
                        style={[
                          styles.providerIconText,
                          {color: psplusAvailable ? PS_ACCENT : DIM_TEXT},
                        ]}>
                        PS
                      </Text>
                    </View>
                    <View style={styles.providerText}>
                      <Text style={styles.providerName}>PS Plus</Text>
                      <Text style={styles.providerSub}>{subtitle}</Text>
                    </View>
                    {preference?.provider === 'psplus' && (
                      <Icon source="check-circle" size={18} color={PS_ACCENT} />
                    )}
                    <Icon source="chevron-right" size={18} color="#8A9A92" />
                  </Pressable>
                </View>
              );
            })()}

          {preference && (
            <Text style={styles.rememberedNote}>{t('RememberedChoice')}</Text>
          )}
        </View>

        {details?.capabilities?.length ? (
          <View>
            <Text style={styles.secTitle}>{t('Features')}</Text>
            <View style={styles.chips}>
              {details.capabilities.map(id => (
                <View style={styles.chip} key={id}>
                  <Ionicons
                    name={CAP_META[id]?.icon || 'ellipse-outline'}
                    size={13}
                    color="#3ad46b"
                  />
                  <Text style={styles.chipText}>{capLabel(t, id)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {hasMedia && (
          <View>
            <Text style={styles.secTitle}>{t('Media')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRail}>
              {trailer && (
                <View style={styles.mediaShotWrap}>
                  <Text style={styles.mediaSrc}>MSFT STORE</Text>
                  {trailer.preview ? (
                    <Image
                      source={{uri: trailer.preview}}
                      resizeMode="cover"
                      style={styles.mediaShot}
                    />
                  ) : (
                    <View style={[styles.mediaShot, styles.trailerFallback]} />
                  )}
                  <View style={styles.playBtn}>
                    <Ionicons name="play" size={18} color="#fff" />
                  </View>
                </View>
              )}
              {screenshots.map((uri, idx) => (
                <View style={styles.mediaShotWrap} key={uri || idx}>
                  {idx === 0 && (
                    <Text style={styles.mediaSrc}>
                      {details?.screenshots?.length ? 'MSFT STORE' : 'GFN'}
                    </Text>
                  )}
                  <Image
                    source={{uri}}
                    resizeMode="cover"
                    style={styles.mediaShot}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {description ? (
          <View>
            <Text style={styles.secTitle}>{t('Description')}</Text>
            <Text style={styles.description} numberOfLines={6}>
              {description}
            </Text>
          </View>
        ) : null}
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
};

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {paddingBottom: 32},
  hero: {aspectRatio: 16 / 9, justifyContent: 'flex-end'},
  heroImage: {...StyleSheet.absoluteFillObject},
  favoriteBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(5,6,8,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTitle: {fontSize: 22, fontWeight: '800', color: '#fff'},
  heroMeta: {fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2},
  body: {padding: 16, gap: 16},
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  starsRow: {flexDirection: 'row'},
  ratingNum: {fontSize: 13, fontWeight: '700'},
  ratingCount: {fontSize: 11.5, color: '#8A9A92'},
  metaRow: {flexDirection: 'row', gap: 24},
  metaCol: {gap: 1},
  metaKey: {fontSize: 10.5, color: '#8A9A92', textTransform: 'uppercase'},
  metaVal: {fontSize: 13, fontWeight: '600'},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A9A92',
  },
  secTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A9A92',
    marginBottom: 8,
  },
  providerCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(140,140,150,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.2)',
  },
  providerCardSpaced: {marginTop: 8, marginBottom: 8},
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  dimRow: {opacity: 0.55},
  providerIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xcloudIconBg: {backgroundColor: 'rgba(16,124,16,0.18)'},
  gfnIconBg: {backgroundColor: 'rgba(118,185,0,0.18)'},
  psplusIconBg: {backgroundColor: 'rgba(0,112,209,0.18)'},
  dimIconBg: {backgroundColor: DIM_ICON_BG},
  providerIconText: {fontWeight: '800', fontSize: 13},
  providerText: {flex: 1, gap: 1},
  providerName: {fontSize: 14, fontWeight: '700'},
  providerSub: {fontSize: 11.5, color: '#8A9A92'},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  priceNow: {fontSize: 12.5, fontWeight: '800'},
  priceNowSale: {color: '#ff5347'},
  priceWas: {
    fontSize: 11,
    color: '#8A9A92',
    textDecorationLine: 'line-through',
  },
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
  storeText: {flex: 1, gap: 1},
  storeName: {fontSize: 13, fontWeight: '600'},
  storeRowEnd: {flexDirection: 'row', alignItems: 'center', gap: 6},
  ownedText: {fontSize: 11, fontWeight: '700', color: NVIDIA_ACCENT},
  storeLinkBtn: {padding: 2},
  rememberedNote: {
    fontSize: 11.5,
    color: '#8A9A92',
    textAlign: 'center',
    marginTop: 8,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.2)',
  },
  chipText: {fontSize: 11.5, fontWeight: '600'},
  mediaRail: {gap: 8},
  mediaShotWrap: {position: 'relative'},
  mediaShot: {
    width: 150,
    height: 94,
    borderRadius: 8,
    backgroundColor: 'rgba(140,140,150,0.14)',
  },
  mediaSrc: {
    position: 'absolute',
    left: 5,
    top: 5,
    zIndex: 1,
    fontSize: 8,
    fontWeight: '800',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(5,6,8,0.6)',
    color: 'rgba(255,255,255,0.85)',
  },
  trailerFallback: {backgroundColor: 'rgba(140,140,150,0.2)'},
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -19,
    marginLeft: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16,124,16,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {fontSize: 13, lineHeight: 19, color: '#B7C6BD'},
});

export default LibraryTitleDetailView;
