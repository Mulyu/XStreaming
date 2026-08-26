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

export const getCoverLayout = (): CoverButton[] => {
  const raw = storage.getString(STORE_KEY);
  if (!raw) {
    return defaultCoverLayout();
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed;
    }
    return defaultCoverLayout();
  } catch {
    return defaultCoverLayout();
  }
};

export const saveCoverLayout = (layout: CoverButton[]) => {
  storage.set(STORE_KEY, JSON.stringify(layout));
};
