import React from 'react';
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {GfnSignInModal} from '../../../entities/gfn-account';
import {
  formatPrice,
  discountPercent,
  isSaleForDisplay,
  getStoreUrl,
  isSteamSaleForDisplay,
  getPsStoreUrl,
  isPsStoreSaleForDisplay,
} from '../../../entities/catalog-title';
import {
  CAP_META,
  capLabel,
  renderStars,
} from '../../../entities/title-capabilities';
import {getTitleProductId} from '../../../features/launch-title';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';
import type {LibraryTitleDetailViewModel} from '../model/useLibraryTitleDetail';
import {alpha, palette} from '../../../shared/config/palette';

const DIM_ICON_BG = alpha(palette.text, 0.16);
const DIM_TEXT = palette.textSoft;
const PS_MARK_COLOR = palette.provider.psBright;

const formatSaleEnd = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
// TV: the left-hand column's fixed art + identity width -- everything else
// (PlayOn/Features/Media/Description) scrolls beside it. See `tvSplit`'s
// own comment for why this screen needs a second layout at all.
const TV_HERO_WIDTH = 340;

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
  inGamePass,
  rating,
  details,
  gfnDetails,
  steamPrices,
  psStorePrice,
  preference,
  owned,
  isFavorite,
  toggleFavorite,
  isWishlisted,
  toggleWishlist,
  playXcloud,
  playPsPlus,
  playGfnVariant,
  canAddShortcut,
  addXcloudShortcut,
  addGfnShortcut,
  addPsPlusShortcut,
  openStore,
}) => {
  // One useTVFocus() per always-rendered-at-most-once Pressable below (the
  // per-provider rows and their nested buttons don't repeat -- only the
  // per-store GFN variant list does, so that one uses the focused-key
  // pattern instead, same as LibraryView's title grid).
  const favoriteFocus = useTVFocus();
  const xcloudRowFocus = useTVFocus();
  const xcloudStoreLinkFocus = useTVFocus();
  const xcloudShortcutFocus = useTVFocus();
  const gfnRowFocus = useTVFocus();
  const gfnStoreLinkFocus = useTVFocus();
  const gfnShortcutFocus = useTVFocus();
  const psplusRowFocus = useTVFocus();
  const psplusStoreLinkFocus = useTVFocus();
  const psplusShortcutFocus = useTVFocus();
  // TV-only buttons: the PS price row, the description toggle, the favorite
  // button, and the media thumbnails (focused-key pattern, they repeat).
  const psPriceFocus = useTVFocus();
  const viewerFocus = useTVFocus();
  const descriptionFocus = useTVFocus();
  const [descriptionExpanded, setDescriptionExpanded] = React.useState(false);
  const [mediaFocusedKey, setMediaFocusedKey] = React.useState<string | null>(
    null,
  );
  const [viewerUri, setViewerUri] = React.useState<string | null>(null);
  const [focusedVariantKey, setFocusedVariantKey] = React.useState<
    string | null
  >(null);
  const [focusedStoreRow, setFocusedStoreRow] = React.useState<string | null>(
    null,
  );

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

  const psPlusGame = catalogTitle.psplus?.raw;
  const psStoreUrl = catalogTitle.psplus
    ? getPsStoreUrl(psPlusGame?.conceptId, psPlusGame?.storeProductId)
    : null;
  // The purchase price/sale is shown also for titles in the Plus catalog
  // (it is still a discount on owning the game).
  const psPurchase =
    catalogTitle.psplus && !catalogTitle.psplus.isOwned
      ? psStorePrice?.purchase ?? null
      : null;
  const psStoreShowSale = !!psPurchase && isPsStoreSaleForDisplay(psStorePrice);

  // One save button per title: the heart (favorite) when it's owned, the
  // bookmark (wishlist) when it isn't.
  const saveOn = owned ? isFavorite : isWishlisted;
  const saveLabel = t(
    owned
      ? saveOn
        ? 'FavoriteRemove'
        : 'FavoriteAdd'
      : saveOn
      ? 'WishlistRemove'
      : 'WishlistAdd',
  );
  const saveIcon = owned
    ? saveOn
      ? 'heart'
      : 'heart-outline'
    : saveOn
    ? 'bookmark'
    : 'bookmark-outline';
  const saveColor = saveOn
    ? owned
      ? palette.sale
      : palette.accent
    : palette.white;
  const onSave = owned ? toggleFavorite : toggleWishlist;

  const favoriteBtn = (
    <Pressable
      style={[styles.favoriteBtn, favoriteFocus.focused && tvFocusRing]}
      onPress={onSave}
      onFocus={favoriteFocus.onFocus}
      onBlur={favoriteFocus.onBlur}
      accessibilityLabel={saveLabel}>
      <Ionicons name={saveIcon} size={20} color={saveColor} />
    </Pressable>
  );

  const ratingSection = rating ? (
    <View style={styles.ratingRow}>
      <View style={styles.starsRow}>{renderStars(rating.average)}</View>
      <Text style={styles.ratingNum}>{rating.average.toFixed(1)}</Text>
      <Text style={styles.ratingCount}>({rating.count.toLocaleString()})</Text>
    </View>
  ) : null;

  const metaSection =
    developer || publisher ? (
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
    ) : null;

  // PlayOn, Features, Media and Description are identical on phone and TV
  // (see `tvSplit`'s own comment) -- only the hero/identity above them and
  // the overall container differ, so this is built once and reused by both
  // layouts below.
  // A title none of the streaming catalogs contain (wishlisted from the
  // Store, say): nothing to play, so the "Play on" list is replaced by the
  // stores it can be bought from, each priced live where the service answers
  // and from the price saved with it otherwise.
  const isStoreOnly =
    !!catalogTitle.store &&
    !catalogTitle.xcloud &&
    !catalogTitle.gfn &&
    !catalogTitle.psplus;
  const storeRefs = catalogTitle.store?.refs ?? {};
  const storeSnapshot = catalogTitle.store?.snapshot;
  const onlyOneStore = Object.values(storeRefs).filter(Boolean).length === 1;
  type StoreOnlyRow = {
    key: string;
    letter: string;
    iconStyle: object;
    color: string;
    name: string;
    price?: string;
    was?: string;
    sale: boolean;
    url: string | null;
  };
  const savedPrice = (live: boolean): Partial<StoreOnlyRow> =>
    !live && (onlyOneStore || storeRefs.ps) && storeSnapshot
      ? {
          price: storeSnapshot.price,
          was: storeSnapshot.originalPrice,
          sale: (storeSnapshot.discountPercent || 0) > 0,
        }
      : {};
  const storeOnlyRows: StoreOnlyRow[] = [];
  if (storeRefs.xbox) {
    storeOnlyRows.push({
      key: 'xbox',
      letter: 'X',
      iconStyle: styles.xcloudIconBg,
      color: palette.provider.xbox,
      name: 'Microsoft Store',
      sale: xcloudDiscount > 0,
      price: price
        ? formatPrice(price.listPrice, price.currencyCode)
        : undefined,
      was:
        price && xcloudDiscount > 0
          ? formatPrice(price.msrp, price.currencyCode)
          : undefined,
      url: getStoreUrl(storeRefs.xbox),
      ...(price ? {} : savedPrice(false)),
    });
  }
  if (storeRefs.steam) {
    const steam = steamPrices[storeRefs.steam];
    storeOnlyRows.push({
      key: 'steam',
      letter: 'N',
      iconStyle: styles.gfnIconBg,
      color: palette.provider.gfn,
      name: 'Steam',
      sale: isSteamSaleForDisplay(steam),
      price: steam
        ? formatPrice(steam.final / 100, steam.currencyCode)
        : undefined,
      was:
        steam && isSteamSaleForDisplay(steam)
          ? formatPrice(steam.initial / 100, steam.currencyCode)
          : undefined,
      url: `https://store.steampowered.com/app/${storeRefs.steam}`,
      ...(steam ? {} : savedPrice(false)),
    });
  }
  if (storeRefs.ps) {
    storeOnlyRows.push({
      key: 'ps',
      letter: 'PS',
      iconStyle: styles.psplusIconBg,
      color: palette.provider.ps,
      name: 'PlayStation Store',
      sale: false,
      url: getPsStoreUrl(undefined, storeRefs.ps),
      ...savedPrice(false),
    });
  }

  const storeOnlySection = (
    <View>
      <Text style={styles.sectionLabel}>{t('DetailStorePrices')}</Text>
      <Text style={styles.storeOnlyNote}>{t('DetailNotStreamable')}</Text>
      {storeOnlyRows.length > 0 && (
        <View style={[styles.providerCard, styles.providerCardSpaced]}>
          {storeOnlyRows.map(row => (
            <Pressable
              key={row.key}
              style={[
                styles.providerRow,
                focusedStoreRow === row.key && tvFocusRing,
              ]}
              disabled={!row.url}
              onPress={() => row.url && openStore(row.url)}
              onFocus={() => setFocusedStoreRow(row.key)}
              onBlur={() =>
                setFocusedStoreRow(prev => (prev === row.key ? null : prev))
              }>
              <View style={[styles.providerIcon, row.iconStyle]}>
                <Text style={[styles.providerIconText, {color: row.color}]}>
                  {row.letter}
                </Text>
              </View>
              <View style={styles.providerText}>
                <Text style={styles.providerName}>{row.name}</Text>
                {row.price ? (
                  <View style={styles.priceRow}>
                    <Text
                      style={[
                        styles.priceNow,
                        row.sale && styles.priceNowSale,
                      ]}>
                      {row.price}
                    </Text>
                    {row.sale && row.was ? (
                      <Text style={styles.priceWas}>{row.was}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Icon source="open-in-new" size={16} color={palette.textSoft} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const streamPlayOnSection = (
    <View>
      <Text style={styles.sectionLabel}>{t('PlayOn')}</Text>

      {catalogTitle.xcloud && (
        <View style={[styles.providerCard, styles.providerCardSpaced]}>
          <Pressable
            style={[
              styles.providerRow,
              !xcloudEntitled && styles.dimRow,
              xcloudRowFocus.focused && tvFocusRing,
            ]}
            onPress={playXcloud}
            onFocus={xcloudRowFocus.onFocus}
            onBlur={xcloudRowFocus.onBlur}>
            <View
              style={[
                styles.providerIcon,
                xcloudEntitled ? styles.xcloudIconBg : styles.dimIconBg,
              ]}>
              <Text
                style={[
                  styles.providerIconText,
                  {color: xcloudEntitled ? palette.provider.xbox : DIM_TEXT},
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
              {!xcloudEntitled && (price || inGamePass) && (
                <View style={styles.priceRow}>
                  {price && (
                    <Text
                      style={[
                        styles.priceNow,
                        xcloudDiscount > 0 &&
                          !inGamePass &&
                          styles.priceNowSale,
                        // Same as the PS catalog: a Game Pass title's price is
                        // struck through, with the inclusion said beside it.
                        inGamePass && styles.priceStruck,
                      ]}>
                      {formatPrice(price.listPrice, price.currencyCode)}
                    </Text>
                  )}
                  {inGamePass && (
                    <Text
                      style={[
                        styles.psIncludedText,
                        {color: palette.provider.xbox},
                      ]}>
                      {t('GamePassIncludedInCatalog')}
                    </Text>
                  )}
                  {price && xcloudDiscount > 0 && !inGamePass && (
                    <Text style={styles.priceWas}>
                      {formatPrice(price.msrp, price.currencyCode)}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {isPreferredXcloud && (
              <Icon
                source="check-circle"
                size={18}
                color={palette.provider.xbox}
              />
            )}
            {xcloudProductId && (
              <Pressable
                style={[
                  styles.storeLinkBtn,
                  xcloudStoreLinkFocus.focused && tvFocusRing,
                ]}
                hitSlop={8}
                onPress={() => openStore(getStoreUrl(xcloudProductId))}
                onFocus={xcloudStoreLinkFocus.onFocus}
                onBlur={xcloudStoreLinkFocus.onBlur}>
                <Icon source="open-in-new" size={16} color={palette.textSoft} />
              </Pressable>
            )}
            {canAddShortcut && (
              <Pressable
                style={[
                  styles.storeLinkBtn,
                  xcloudShortcutFocus.focused && tvFocusRing,
                ]}
                hitSlop={8}
                accessibilityLabel={t('Add to desktop')}
                onPress={addXcloudShortcut}
                onFocus={xcloudShortcutFocus.onFocus}
                onBlur={xcloudShortcutFocus.onBlur}>
                <Icon
                  source="plus-box-outline"
                  size={16}
                  color={palette.textSoft}
                />
              </Pressable>
            )}
            <Icon source="chevron-right" size={18} color={palette.textSoft} />
          </Pressable>
        </View>
      )}

      {catalogTitle.gfn && (
        <View style={styles.providerCard}>
          <Pressable
            style={[
              styles.providerRow,
              !gfnAnyOwned && styles.dimRow,
              gfnRowFocus.focused && tvFocusRing,
            ]}
            onPress={() =>
              gfnVariants.length > 1
                ? onToggleGfnExpanded()
                : playGfnVariant(gfnVariants[0])
            }
            onFocus={gfnRowFocus.onFocus}
            onBlur={gfnRowFocus.onBlur}>
            <View
              style={[
                styles.providerIcon,
                gfnAnyOwned ? styles.gfnIconBg : styles.dimIconBg,
              ]}>
              <Text
                style={[
                  styles.providerIconText,
                  {color: gfnAnyOwned ? palette.provider.gfn : DIM_TEXT},
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
              {soleGfnVariant && !soleGfnVariant.owned && soleGfnSteamPrice && (
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
              <Icon
                source="check-circle"
                size={18}
                color={palette.provider.gfn}
              />
            )}
            {soleGfnVariant?.steamAppId && (
              <Pressable
                style={[
                  styles.storeLinkBtn,
                  gfnStoreLinkFocus.focused && tvFocusRing,
                ]}
                hitSlop={8}
                onPress={() =>
                  openStore(
                    `https://store.steampowered.com/app/${soleGfnVariant.steamAppId}`,
                  )
                }
                onFocus={gfnStoreLinkFocus.onFocus}
                onBlur={gfnStoreLinkFocus.onBlur}>
                <Icon source="open-in-new" size={16} color={palette.textSoft} />
              </Pressable>
            )}
            {canAddShortcut && soleGfnVariant && (
              <Pressable
                style={[
                  styles.storeLinkBtn,
                  gfnShortcutFocus.focused && tvFocusRing,
                ]}
                hitSlop={8}
                accessibilityLabel={t('Add to desktop')}
                onPress={() => addGfnShortcut(soleGfnVariant)}
                onFocus={gfnShortcutFocus.onFocus}
                onBlur={gfnShortcutFocus.onBlur}>
                <Icon
                  source="plus-box-outline"
                  size={16}
                  color={palette.textSoft}
                />
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
              color={palette.textSoft}
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
                const variantKey = `${variant.store}:${variant.id}`;
                const rowKey = `${variantKey}:row`;
                const storeLinkKey = `${variantKey}:store`;
                const shortcutKey = `${variantKey}:shortcut`;
                return (
                  <Pressable
                    key={variantKey}
                    style={[
                      styles.storeRow,
                      !variant.owned && styles.dimRow,
                      focusedVariantKey === rowKey && tvFocusRing,
                    ]}
                    onPress={() => playGfnVariant(variant)}
                    onFocus={() => setFocusedVariantKey(rowKey)}
                    onBlur={() =>
                      setFocusedVariantKey(prev =>
                        prev === rowKey ? null : prev,
                      )
                    }>
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
                        <Text style={styles.ownedText}>{t('GfnOwned')}</Text>
                      )}
                      {variant.steamAppId && (
                        <Pressable
                          style={[
                            styles.storeLinkBtn,
                            focusedVariantKey === storeLinkKey && tvFocusRing,
                          ]}
                          hitSlop={8}
                          onPress={() =>
                            openStore(
                              `https://store.steampowered.com/app/${variant.steamAppId}`,
                            )
                          }
                          onFocus={() => setFocusedVariantKey(storeLinkKey)}
                          onBlur={() =>
                            setFocusedVariantKey(prev =>
                              prev === storeLinkKey ? null : prev,
                            )
                          }>
                          <Icon
                            source="open-in-new"
                            size={14}
                            color={palette.textSoft}
                          />
                        </Pressable>
                      )}
                      {canAddShortcut && (
                        <Pressable
                          style={[
                            styles.storeLinkBtn,
                            focusedVariantKey === shortcutKey && tvFocusRing,
                          ]}
                          hitSlop={8}
                          accessibilityLabel={t('Add to desktop')}
                          onPress={() => addGfnShortcut(variant)}
                          onFocus={() => setFocusedVariantKey(shortcutKey)}
                          onBlur={() =>
                            setFocusedVariantKey(prev =>
                              prev === shortcutKey ? null : prev,
                            )
                          }>
                          <Icon
                            source="plus-box-outline"
                            size={14}
                            color={palette.textSoft}
                          />
                        </Pressable>
                      )}
                      {isPreferredGfnVariant(variant.id, variant.store) && (
                        <Icon
                          source="check-circle"
                          size={16}
                          color={palette.provider.gfn}
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
            catalogTitle.psplus.isOwned || catalogTitle.psplus.inPlusCatalog;
          const baseSubtitle = catalogTitle.psplus.isOwned
            ? t('LibraryFilterOwned')
            : catalogTitle.psplus.inPlusCatalog
            ? t('PsPlusIncludedDesc')
            : t('LibraryViewDetails');
          const subtitle = psStoreShowSale
            ? `${baseSubtitle} · ${t('PsStoreOnSale')}`
            : baseSubtitle;
          // In the Plus catalog but not bought: playable at no extra cost, so
          // the price below is shown struck through with that said next to it.
          const includedInCatalog =
            catalogTitle.psplus.inPlusCatalog && !catalogTitle.psplus.isOwned;
          const showPsSale = psStoreShowSale && !includedInCatalog;
          const psPriceRow = (
            <View style={styles.psInfoRow}>
              <View style={styles.storeMark}>
                <Icon source="cart-outline" size={14} color={palette.warning} />
              </View>
              <View style={styles.storeText}>
                <View style={styles.priceRow}>
                  {psPurchase && (
                    <Text
                      style={[
                        styles.priceNow,
                        showPsSale && styles.priceNowSale,
                        includedInCatalog && styles.priceStruck,
                      ]}>
                      {psPurchase.discountedPrice}
                    </Text>
                  )}
                  {includedInCatalog && (
                    <Text style={styles.psIncludedText}>
                      {t('PsStoreIncludedInCatalog')}
                    </Text>
                  )}
                  {psPurchase && showPsSale && (
                    <Text style={styles.priceWas}>{psPurchase.basePrice}</Text>
                  )}
                  {psPurchase && showPsSale && (
                    <View style={styles.salePill}>
                      <Text style={styles.salePillText}>
                        -{psPurchase.discountPercent}%
                      </Text>
                    </View>
                  )}
                </View>
                {psPurchase && showPsSale && psPurchase.memberPrice && (
                  <Text style={styles.saleUntil}>
                    {t('PsStoreMemberPrice')}
                  </Text>
                )}
                {psPurchase && showPsSale && !!psPurchase.saleEndsAt && (
                  <Text style={styles.saleUntil}>
                    {t('PsStoreSaleUntil', {
                      date: formatSaleEnd(psPurchase.saleEndsAt),
                    })}
                  </Text>
                )}
              </View>
            </View>
          );
          return (
            <View style={styles.providerCard}>
              <Pressable
                style={[
                  styles.providerRow,
                  !psplusAvailable && styles.dimRow,
                  psplusRowFocus.focused && tvFocusRing,
                ]}
                onPress={playPsPlus}
                onFocus={psplusRowFocus.onFocus}
                onBlur={psplusRowFocus.onBlur}>
                <View
                  style={[
                    styles.providerIcon,
                    psplusAvailable ? styles.psplusIconBg : styles.dimIconBg,
                  ]}>
                  <Text
                    style={[
                      styles.providerIconText,
                      {color: psplusAvailable ? palette.provider.ps : DIM_TEXT},
                    ]}>
                    PS
                  </Text>
                </View>
                <View style={styles.providerText}>
                  <Text style={styles.providerName}>PS Plus</Text>
                  <Text style={styles.providerSub}>{subtitle}</Text>
                </View>
                {preference?.provider === 'psplus' && (
                  <Icon
                    source="check-circle"
                    size={18}
                    color={palette.provider.ps}
                  />
                )}
                {psStoreUrl && (
                  <Pressable
                    style={[
                      styles.storeLinkBtn,
                      psplusStoreLinkFocus.focused && tvFocusRing,
                    ]}
                    hitSlop={8}
                    onPress={() => openStore(psStoreUrl)}
                    onFocus={psplusStoreLinkFocus.onFocus}
                    onBlur={psplusStoreLinkFocus.onBlur}>
                    <Icon
                      source="open-in-new"
                      size={16}
                      color={palette.textSoft}
                    />
                  </Pressable>
                )}
                {canAddShortcut && (
                  <Pressable
                    style={[
                      styles.storeLinkBtn,
                      psplusShortcutFocus.focused && tvFocusRing,
                    ]}
                    hitSlop={8}
                    accessibilityLabel={t('Add to desktop')}
                    onPress={addPsPlusShortcut}
                    onFocus={psplusShortcutFocus.onFocus}
                    onBlur={psplusShortcutFocus.onBlur}>
                    <Icon
                      source="plus-box-outline"
                      size={16}
                      color={palette.textSoft}
                    />
                  </Pressable>
                )}
                <Icon
                  source="chevron-right"
                  size={18}
                  color={palette.textSoft}
                />
              </Pressable>
              {(includedInCatalog || psPurchase) && (
                <View style={styles.stores}>
                  {Platform.isTV && psStoreUrl ? (
                    <Pressable
                      style={[
                        styles.tvInfoButton,
                        psPriceFocus.focused && tvFocusRing,
                      ]}
                      onPress={() => openStore(psStoreUrl)}
                      onFocus={psPriceFocus.onFocus}
                      onBlur={psPriceFocus.onBlur}
                      accessibilityRole="button"
                      accessibilityLabel={t('PsStoreOpenStore')}>
                      {psPriceRow}
                    </Pressable>
                  ) : (
                    psPriceRow
                  )}
                </View>
              )}
            </View>
          );
        })()}

      {preference && (
        <Text style={styles.rememberedNote}>{t('RememberedChoice')}</Text>
      )}
    </View>
  );

  const playOnSection = isStoreOnly ? storeOnlySection : streamPlayOnSection;

  const featuresSection = details?.capabilities?.length ? (
    <View>
      <Text style={styles.secTitle}>{t('Features')}</Text>
      <View style={styles.chips}>
        {details.capabilities.map(id => (
          <View style={styles.chip} key={id}>
            <Ionicons
              name={CAP_META[id]?.icon || 'ellipse-outline'}
              size={13}
              color={palette.success}
            />
            <Text style={styles.chipText}>{capLabel(t, id)}</Text>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  // TV: each thumbnail is a focusable button (the trailer opens in the
  // system player, a screenshot in a full-screen viewer); on the phone they
  // stay plain images.
  const mediaItem = (
    key: string,
    label: string,
    onPress: () => void,
    children: React.ReactNode,
  ) =>
    Platform.isTV ? (
      <Pressable
        key={key}
        style={[
          styles.mediaShotWrap,
          styles.mediaShotButton,
          mediaFocusedKey === key && tvFocusRing,
        ]}
        onPress={onPress}
        onFocus={() => setMediaFocusedKey(key)}
        onBlur={() => setMediaFocusedKey(prev => (prev === key ? null : prev))}
        accessibilityRole="button"
        accessibilityLabel={label}>
        {children}
      </Pressable>
    ) : (
      <View key={key} style={styles.mediaShotWrap}>
        {children}
      </View>
    );

  const mediaSection = hasMedia ? (
    <View>
      <Text style={styles.secTitle}>{t('Media')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mediaRail}>
        {trailer &&
          mediaItem(
            'trailer',
            t('Trailer'),
            () => openStore(trailer.url),
            <>
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
                <Ionicons name="play" size={18} color={palette.white} />
              </View>
            </>,
          )}
        {screenshots.map((uri, idx) =>
          mediaItem(
            uri || String(idx),
            t('Media'),
            () => setViewerUri(uri),
            <>
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
            </>,
          ),
        )}
      </ScrollView>
    </View>
  ) : null;

  const descriptionSection = description ? (
    <View>
      <Text style={styles.secTitle}>{t('Description')}</Text>
      {Platform.isTV ? (
        // A button on TV: OK expands/collapses the full text.
        <Pressable
          style={[
            styles.descriptionButton,
            descriptionFocus.focused && tvFocusRing,
          ]}
          onPress={() => setDescriptionExpanded(v => !v)}
          onFocus={descriptionFocus.onFocus}
          onBlur={descriptionFocus.onBlur}
          accessibilityRole="button">
          <Text
            style={styles.description}
            numberOfLines={descriptionExpanded ? undefined : 6}>
            {description}
          </Text>
          <View style={styles.descriptionMore}>
            <Icon
              source={descriptionExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.textSoft}
            />
            <Text style={styles.descriptionMoreText}>
              {descriptionExpanded ? t('Collapse') : t('Expand')}
            </Text>
          </View>
        </Pressable>
      ) : (
        <Text style={styles.description} numberOfLines={6}>
          {description}
        </Text>
      )}
    </View>
  ) : null;

  // TV: a full-width 16:9 hero on a 16:9 screen fills almost the entire
  // frame, pushing PlayOn/Features/Media/Description below the fold on
  // every single title. Splitting into a fixed-width art+identity column
  // beside a scrolling body (the shape most TV apps' own detail screens
  // use) keeps the image at a sane size without losing any content below
  // it -- phone's full-bleed hero + single scroll stays untouched, since a
  // 16:9 band is proportionally much smaller on a tall phone screen.
  if (Platform.isTV) {
    return (
      <View style={[styles.root, {backgroundColor}]}>
        <View style={styles.tvSplit}>
          <View style={styles.tvLeft}>
            <View style={styles.tvHero}>
              {catalogTitle.imageUrl ? (
                <Image
                  source={{uri: catalogTitle.imageUrl}}
                  resizeMode="cover"
                  style={styles.heroImage}
                />
              ) : null}
            </View>
            <View style={styles.tvIdentity}>
              <Text style={styles.tvTitle} numberOfLines={2}>
                {catalogTitle.title}
              </Text>
              {genres.length > 0 && (
                <Text style={styles.tvGenres}>
                  {genres.slice(0, 3).join(' · ')}
                </Text>
              )}
              {ratingSection}
              {metaSection}
            </View>
            <Pressable
              style={[
                styles.tvFavoriteBtn,
                favoriteFocus.focused && tvFocusRing,
              ]}
              onPress={onSave}
              onFocus={favoriteFocus.onFocus}
              onBlur={favoriteFocus.onBlur}
              accessibilityRole="button"
              accessibilityLabel={saveLabel}>
              <Ionicons name={saveIcon} size={22} color={saveColor} />
              <Text style={styles.tvFavoriteText}>
                {t(owned ? 'LibraryFilterFavorite' : 'LibraryFilterWishlist')}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.tvRight}
            contentContainerStyle={styles.tvRightContent}>
            {playOnSection}
            {featuresSection}
            {mediaSection}
            {descriptionSection}
          </ScrollView>
        </View>

        <GfnSignInModal
          visible={loginVisible}
          status={loginStatus}
          challenge={challenge}
          onRetry={retryLogin}
          onCancel={cancelLogin}
        />

        <Modal
          visible={!!viewerUri}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerUri(null)}>
          <Pressable
            style={[styles.viewerRoot, viewerFocus.focused && tvFocusRing]}
            onPress={() => setViewerUri(null)}
            onFocus={viewerFocus.onFocus}
            onBlur={viewerFocus.onBlur}
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            hasTVPreferredFocus>
            {viewerUri ? (
              <Image
                source={{uri: viewerUri}}
                resizeMode="contain"
                style={styles.viewerImage}
              />
            ) : null}
          </Pressable>
        </Modal>
      </View>
    );
  }

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
        {favoriteBtn}
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
        {ratingSection}
        {metaSection}
        {playOnSection}
        {featuresSection}
        {mediaSection}
        {descriptionSection}
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
    backgroundColor: alpha(palette.scrim, 0.55),
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    padding: 16,
    backgroundColor: alpha(palette.black, 0.35),
  },
  heroTitle: {fontSize: 22, fontWeight: '800', color: palette.white},
  heroMeta: {fontSize: 12, color: alpha(palette.white, 0.85), marginTop: 2},
  body: {padding: 16, gap: 16},
  // TV two-pane split: a fixed-width left column (art + identity, never
  // scrolls) beside a scrolling right column for everything else.
  tvSplit: {flex: 1, flexDirection: 'row', padding: 24, gap: 24},
  tvLeft: {width: TV_HERO_WIDTH, gap: 12},
  tvHero: {
    width: TV_HERO_WIDTH,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: alpha(palette.text, 0.14),
  },
  tvIdentity: {gap: 10},
  tvTitle: {fontSize: 20, fontWeight: '800'},
  tvGenres: {fontSize: 12, color: palette.textSoft},
  tvRight: {flex: 1},
  tvRightContent: {gap: 16, paddingBottom: 32},
  ratingRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  starsRow: {flexDirection: 'row'},
  ratingNum: {fontSize: 13, fontWeight: '700'},
  ratingCount: {fontSize: 11.5, color: palette.textSoft},
  metaRow: {flexDirection: 'row', gap: 24},
  metaCol: {gap: 1},
  metaKey: {
    fontSize: 10.5,
    color: palette.textSoft,
    textTransform: 'uppercase',
  },
  metaVal: {fontSize: 13, fontWeight: '600'},
  storeOnlyNote: {
    fontSize: 12.5,
    color: palette.textSoft,
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.textSoft,
  },
  secTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.textSoft,
    marginBottom: 8,
  },
  providerCard: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: alpha(palette.text, 0.1),
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.2),
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
  xcloudIconBg: {backgroundColor: alpha(palette.provider.xbox, 0.18)},
  gfnIconBg: {backgroundColor: alpha(palette.provider.gfn, 0.18)},
  psplusIconBg: {backgroundColor: alpha(palette.provider.ps, 0.18)},
  dimIconBg: {backgroundColor: DIM_ICON_BG},
  providerIconText: {fontWeight: '800', fontSize: 13},
  providerText: {flex: 1, gap: 1},
  // 10-foot viewing on TV gets a small bump over phone's own sizes.
  providerName: {fontSize: Platform.isTV ? 15 : 14, fontWeight: '700'},
  providerSub: {fontSize: Platform.isTV ? 12.5 : 11.5, color: palette.textSoft},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  priceNow: {fontSize: 12.5, fontWeight: '800'},
  priceNowSale: {color: palette.sale},
  // An included-in-catalog title's price: struck through, with the "included"
  // note beside it.
  priceStruck: {
    color: palette.textSoft,
    textDecorationLine: 'line-through',
  },
  psIncludedText: {fontSize: 11.5, fontWeight: '700', color: PS_MARK_COLOR},
  priceWas: {
    fontSize: 11,
    color: palette.textSoft,
    textDecorationLine: 'line-through',
  },
  stores: {
    borderTopWidth: 1,
    borderTopColor: alpha(palette.text, 0.2),
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
    backgroundColor: alpha(palette.text, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMarkText: {fontSize: 9, fontWeight: '800', color: palette.textSoft},
  storeText: {flex: 1, gap: 1},
  storeName: {fontSize: 13, fontWeight: '600'},
  // Informational PS rows under the PS card (included / trial / purchase) --
  // same indent as the GFN store rows, but not pressable.
  psInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingLeft: 22,
  },
  psInfoNote: {fontSize: 11, color: DIM_TEXT},
  salePill: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: palette.warning,
  },
  salePillText: {fontSize: 10, fontWeight: '800', color: palette.onAccent},
  saleUntil: {fontSize: 10.5, color: palette.warning},
  storeRowEnd: {flexDirection: 'row', alignItems: 'center', gap: 6},
  ownedText: {fontSize: 11, fontWeight: '700', color: palette.provider.gfn},
  // TV: a real button-sized target (the remote lands on it), not a bare icon.
  storeLinkBtn: Platform.isTV
    ? {
        padding: 10,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: alpha(palette.white, 0.07),
      }
    : {padding: 2},
  tvInfoButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tvFavoriteBtn: {
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: alpha(palette.white, 0.07),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tvFavoriteText: {fontSize: 15, fontWeight: '700', color: palette.text},
  mediaShotButton: {
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  descriptionButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 6,
  },
  descriptionMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  descriptionMoreText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: palette.textSoft,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: alpha(palette.black, 0.92),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  viewerImage: {width: '100%', height: '100%'},
  rememberedNote: {
    fontSize: 11.5,
    color: palette.textSoft,
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
    backgroundColor: alpha(palette.text, 0.1),
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.2),
  },
  chipText: {fontSize: 11.5, fontWeight: '600'},
  mediaRail: {gap: 8},
  mediaShotWrap: {position: 'relative'},
  mediaShot: {
    width: 150,
    height: 94,
    borderRadius: 8,
    backgroundColor: alpha(palette.text, 0.14),
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
    backgroundColor: alpha(palette.scrim, 0.6),
    color: alpha(palette.white, 0.85),
  },
  trailerFallback: {backgroundColor: alpha(palette.text, 0.2)},
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -19,
    marginLeft: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: alpha(palette.provider.xbox, 0.92),
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {fontSize: 13, lineHeight: 19, color: palette.textSoft},
});

export default LibraryTitleDetailView;
