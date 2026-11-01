import {palette} from '../../../shared/config/palette';
import type {CatalogTitle} from './unifiedCatalog';

export type ProviderKey = 'xbox' | 'gfn' | 'ps';

// Where a title stands on one service: `owned` (entitled / owned there),
// `catalog` (playable because the subscription's catalog includes it: Game
// Pass, PS Plus), `notOwned` (the service has it but this account cannot play
// it today) or `none` (the service does not list it).
export type ProviderStatus = 'owned' | 'catalog' | 'notOwned' | 'none';

export const PROVIDER_KEYS: ProviderKey[] = ['xbox', 'gfn', 'ps'];

export const PROVIDER_NAMES: Record<ProviderKey, string> = {
  xbox: 'Xbox',
  gfn: 'GeForce NOW',
  ps: 'PS Plus',
};

const LETTERS: Record<ProviderKey, string> = {xbox: 'X', gfn: 'N', ps: 'PS'};

// `inGamePass` comes from the price fetch (Game Pass membership is not part of
// the catalog item itself).
export const providerStatuses = (
  item: CatalogTitle,
  opts: {inGamePass?: boolean} = {},
): Record<ProviderKey, ProviderStatus> => {
  const xbox: ProviderStatus = !item.xcloud
    ? 'none'
    : item.xcloud.hasEntitlement
    ? opts.inGamePass
      ? 'catalog'
      : 'owned'
    : 'notOwned';
  const gfn: ProviderStatus = !item.gfn
    ? 'none'
    : item.gfn.variants.some(v => v.owned)
    ? 'owned'
    : 'notOwned';
  const ps: ProviderStatus = !item.psplus
    ? 'none'
    : item.psplus.isOwned
    ? 'owned'
    : item.psplus.inPlusCatalog
    ? 'catalog'
    : 'notOwned';
  return {xbox, gfn, ps};
};

export type ProviderBadge = {
  provider: ProviderKey;
  letter: string;
  color: string;
  // Playable on this service today (owned or in its catalog).
  on: boolean;
  // Playable through the subscription catalog rather than by owning it.
  catalog: boolean;
};

// One badge per service that lists the title, in X / N / PS order -- what a
// title card draws.
export const providerBadges = (
  item: CatalogTitle,
  opts: {inGamePass?: boolean} = {},
): ProviderBadge[] => {
  const statuses = providerStatuses(item, opts);
  return PROVIDER_KEYS.filter(key => statuses[key] !== 'none').map(key => ({
    provider: key,
    letter: LETTERS[key],
    color: palette.provider[key],
    on: statuses[key] === 'owned' || statuses[key] === 'catalog',
    catalog: statuses[key] === 'catalog',
  }));
};
