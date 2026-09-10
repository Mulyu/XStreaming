import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Canonical capability id -> icon + label. Labels are either translated
// (t(...)) or kept as brand literals (4K, HDR, Dolby Atmos, ...). Shared by
// TitleDetail.tsx and LibraryTitleDetail.tsx so the two detail screens agree
// on how a capability id renders.
export const CAP_META: Record<
  string,
  {icon: string; label: string; i18n?: boolean}
> = {
  single: {icon: 'person-outline', label: 'Single player', i18n: true},
  multi: {icon: 'people-outline', label: 'Multiplayer', i18n: true},
  coop: {icon: 'people-circle-outline', label: 'Co-op', i18n: true},
  crossplat: {icon: 'git-compare-outline', label: 'Cross-platform', i18n: true},
  optimized: {
    icon: 'flash-outline',
    label: 'Optimized for Series X|S',
    i18n: true,
  },
  '4k': {icon: 'tv-outline', label: '4K'},
  hdr: {icon: 'contrast-outline', label: 'HDR'},
  dolbyvision: {icon: 'contrast-outline', label: 'Dolby Vision'},
  atmos: {icon: 'volume-high-outline', label: 'Dolby Atmos'},
  dtsx: {icon: 'volume-high-outline', label: 'DTS:X'},
  spatial: {icon: 'headset-outline', label: 'Spatial sound', i18n: true},
  achievements: {icon: 'trophy-outline', label: 'Achievements', i18n: true},
  cloudsaves: {icon: 'cloud-outline', label: 'Cloud saves', i18n: true},
};

export const capLabel = (t: (key: string) => string, id: string): string => {
  const meta = CAP_META[id];
  if (!meta) {
    return id;
  }
  return meta.i18n ? t(meta.label) : meta.label;
};

export const renderStars = (avg: number): React.ReactNode[] => {
  const items: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    let name = 'star-outline';
    if (avg >= i) {
      name = 'star';
    } else if (avg >= i - 0.5) {
      name = 'star-half';
    }
    items.push(<Ionicons key={i} name={name} size={16} color="#ffc233" />);
  }
  return items;
};
