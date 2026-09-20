import {psPlusChiaki} from './native';

// One row of libchiaki's unified cloud catalog contract (chiaki/cloudcatalog.h),
// shared verbatim with Qt/iOS -- every field below is precomputed by the
// native lib; this layer renders it as-is and must not re-derive category,
// serviceType, platform, ownership or stream routing (mirrors Pylux's own
// CloudGame.fromContract in CloudGameRepository.kt).
export type CloudGame = {
  productId: string;
  name: string;
  imageUrl: string;
  landscapeImageUrl: string;
  thumbnailUrl: string;
  /** "ps3" | "ps4" | "ps5" */
  platform: string;
  /** "psnow" | "pscloud" */
  serviceType: string;
  conceptUrl: string;
  conceptId: string;
  isOwned: boolean;
  entitlementId: string;
  storeProductId: string;
  plusCatalog: boolean;
  /** "owned" | "streamable" | "purchaseable" */
  category: string;
  streamServiceType: string;
  streamIdentifier: string;
};

export type UnifiedCatalogResult = {
  games: CloudGame[];
  warning?: string;
  settledLocale?: string;
  fallbackRegion?: string;
  resolvedStoreLang?: string;
  nativeMode: boolean;
};

const toCloudGame = (raw: any): CloudGame | null => {
  const productId = typeof raw?.productId === 'string' ? raw.productId : '';
  const name = typeof raw?.name === 'string' ? raw.name : '';
  if (!productId || !name) {
    return null;
  }
  const imageUrl = typeof raw?.imageUrl === 'string' ? raw.imageUrl : '';
  const serviceType =
    typeof raw?.serviceType === 'string' && raw.serviceType
      ? raw.serviceType
      : 'pscloud';
  return {
    productId,
    name,
    imageUrl,
    landscapeImageUrl:
      typeof raw?.landscapeImageUrl === 'string' && raw.landscapeImageUrl
        ? raw.landscapeImageUrl
        : imageUrl,
    thumbnailUrl: imageUrl,
    platform: typeof raw?.platform === 'string' ? raw.platform : 'ps4',
    serviceType,
    conceptUrl: typeof raw?.conceptUrl === 'string' ? raw.conceptUrl : '',
    conceptId: typeof raw?.conceptId === 'string' ? raw.conceptId : '',
    isOwned: !!raw?.isOwned,
    entitlementId:
      typeof raw?.entitlementId === 'string' ? raw.entitlementId : '',
    storeProductId:
      typeof raw?.storeProductId === 'string' ? raw.storeProductId : '',
    plusCatalog: !!raw?.plusCatalog,
    category: typeof raw?.category === 'string' ? raw.category : '',
    streamServiceType:
      typeof raw?.streamServiceType === 'string' && raw.streamServiceType
        ? raw.streamServiceType
        : serviceType,
    streamIdentifier:
      typeof raw?.streamIdentifier === 'string' && raw.streamIdentifier
        ? raw.streamIdentifier
        : productId,
  };
};

/**
 * Fetch (or serve the lib-owned on-disk cache of) the unified PS Plus cloud
 * catalog -- one merged, deduped, tagged list across PS Now (PS3/PS4) and
 * PS5 cloud streaming. Blocking on the native side; the caller doesn't need
 * to do anything special here since the native bridge already dispatches it
 * off the JS thread.
 */
export const fetchUnifiedCatalog = async (
  npsso: string | undefined,
  locale: string | undefined,
  forceRefresh = false,
): Promise<UnifiedCatalogResult> => {
  const raw = await psPlusChiaki.fetchCatalog(npsso, locale, forceRefresh);
  const root = JSON.parse(raw);
  const games: CloudGame[] = Array.isArray(root?.games)
    ? root.games
        .map(toCloudGame)
        .filter((g: CloudGame | null): g is CloudGame => !!g)
    : [];
  return {
    games,
    warning:
      typeof root?.warning === 'string' && root.warning
        ? root.warning
        : undefined,
    settledLocale:
      typeof root?.settledLocale === 'string' && root.settledLocale
        ? root.settledLocale
        : undefined,
    fallbackRegion:
      typeof root?.fallbackRegion === 'string'
        ? root.fallbackRegion
        : undefined,
    resolvedStoreLang:
      typeof root?.resolvedStoreLang === 'string'
        ? root.resolvedStoreLang
        : undefined,
    nativeMode: root?.nativeMode !== false,
  };
};

export const CloudCategory = {
  OWNED: 'owned',
  STREAMABLE: 'streamable',
  PURCHASEABLE: 'purchaseable',
} as const;
