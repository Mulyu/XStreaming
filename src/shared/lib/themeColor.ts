import {palette} from '../config/palette';

type Rgb = {
  r: number;
  g: number;
  b: number;
};

const clamp = (value: number, min = 0, max = 255) =>
  Math.max(min, Math.min(max, value));

const rgbStringToRgb = (color: string): Rgb | null => {
  const matched = color
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!matched) {
    return null;
  }
  return {
    r: clamp(parseInt(matched[1], 10)),
    g: clamp(parseInt(matched[2], 10)),
    b: clamp(parseInt(matched[3], 10)),
  };
};

const hexToRgb = (hexColor: string): Rgb => {
  const normalized = normalizeHexColor(hexColor);
  const clean = normalized.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return {r, g, b};
};

const rgbToHex = ({r, g, b}: Rgb): string =>
  `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();

const toRgb = (color: string): Rgb => {
  const rgb = rgbStringToRgb(color);
  if (rgb) {
    return rgb;
  }
  return hexToRgb(color);
};

const mixColor = (sourceColor: string, targetColor: string, ratio: number) => {
  const from = toRgb(sourceColor);
  const to = toRgb(targetColor);
  const p = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: Math.round(from.r + (to.r - from.r) * p),
    g: Math.round(from.g + (to.g - from.g) * p),
    b: Math.round(from.b + (to.b - from.b) * p),
  });
};

export const normalizeHexColor = (
  color: string | undefined,
  fallback: string = palette.accent,
) => {
  if (!color || typeof color !== 'string') {
    return fallback;
  }
  const input = color.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(input)) {
    const expanded = input
      .split('')
      .map(ch => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(input)) {
    return `#${input.toUpperCase()}`;
  }
  return fallback;
};

export const shiftColor = (hexColor: string, amount: number) => {
  const normalized = normalizeHexColor(hexColor);
  if (amount >= 0) {
    return mixColor(normalized, palette.white, amount);
  }
  return mixColor(normalized, palette.black, -amount);
};
