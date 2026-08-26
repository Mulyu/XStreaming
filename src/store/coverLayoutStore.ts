import {storage} from './mmkv';

// Layout of the buttons shown on the foldable cover (outer) screen. Positions
// and sizes are stored as fractions (0..1) so they map across the editor canvas
// and the actual cover display, which have different pixel sizes.
//  - x, y: top-left position as a fraction of width / height
//  - size: square side length as a fraction of width
const STORE_KEY = 'user.coverLayout';

export type CoverButton = {
  name: string;
  label: string;
  x: number;
  y: number;
  size: number;
  show: boolean;
};

// Left half sends the R buttons and right half the L buttons: the outer screen
// faces the opposite way, so this mirrors a normal grip.
export const defaultCoverLayout = (): CoverButton[] => [
  {name: 'RightTrigger', label: 'RT', x: 0.05, y: 0.12, size: 0.18, show: true},
  {
    name: 'RightShoulder',
    label: 'RB',
    x: 0.05,
    y: 0.55,
    size: 0.18,
    show: true,
  },
  {name: 'LeftTrigger', label: 'LT', x: 0.77, y: 0.12, size: 0.18, show: true},
  {name: 'LeftShoulder', label: 'LB', x: 0.77, y: 0.55, size: 0.18, show: true},
];

// Cover layouts are stored per touch-controller profile ('' = Default), keyed
// by name in one map, so the cover buttons follow the active profile like the
// inner controls do.
const readMap = (): Record<string, CoverButton[]> => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    // Migrate the legacy single-array layout to the Default profile.
    if (Array.isArray(parsed)) {
      return parsed.length ? {'': parsed} : {};
    }
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
};

export const getCoverLayout = (profileName = ''): CoverButton[] => {
  const layout = readMap()[profileName || ''];
  return Array.isArray(layout) && layout.length ? layout : defaultCoverLayout();
};

export const saveCoverLayout = (profileName: string, layout: CoverButton[]) => {
  const map = readMap();
  map[profileName || ''] = layout;
  storage.set(STORE_KEY, JSON.stringify(map));
};
