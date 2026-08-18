import {
  createDefaultMacroLayoutButton,
  VIRTUAL_MACRO_BUTTON_NAME,
} from './virtualMacro';

export type ButtonConfig = {
  name: string;
  x: number;
  y: number;
  scale?: number;
  show?: boolean;
  width?: number;
  height?: number;
};

// Canonical on-screen base size (before scale) for each button. The editor and
// the in-game renderer both derive their box size from here, so a laid-out
// button occupies the same rectangle in both. Previously the editor used
// different sizes (A/B/X/Y 100, default 40, macro 80) than the game (60 / 50 /
// 60), which — with top-left positioning — shifted every button's visual
// centre between editing and play.
export const getButtonBaseSize = (
  name: string,
): {width: number; height: number} => {
  if (name === 'A' || name === 'B' || name === 'X' || name === 'Y') {
    return {width: 60, height: 60};
  }
  if (name.indexOf('DPad') > -1) {
    return {width: 70, height: 70};
  }
  if (name === VIRTUAL_MACRO_BUTTON_NAME) {
    return {width: 60, height: 60};
  }
  return {width: 50, height: 50};
};

// Editor drag snapping. Positions snap to this grid (which matches the editor's
// GridBackground) so users place buttons in coarse steps instead of fiddling
// pixel by pixel.
export const LAYOUT_SNAP_GRID = 20;

export const snapToGrid = (value: number, grid = LAYOUT_SNAP_GRID): number =>
  Math.round(value / grid) * grid;

// The single canonical default layout, shared by the in-game renderer and both
// editors so the default (unedited) layout is identical everywhere. Positions
// are top-left, in the play surface's pixel space.
export const buildDefaultLayout = (
  width: number,
  height: number,
): ButtonConfig[] => {
  const nexusLeft = width * 0.5 - 20;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return [
    {name: 'LeftTrigger', x: 30, y: 40, scale: 1, show: true},
    {name: 'RightTrigger', x: width - 30, y: 40, scale: 1, show: true},
    {name: 'LeftShoulder', x: 30, y: 100, scale: 1, show: true},
    {name: 'RightShoulder', x: width - 30, y: 110, scale: 1, show: true},
    {name: 'A', x: width - 90, y: height - 60, scale: 1, show: true},
    {name: 'B', x: width - 40, y: height - 110, scale: 1, show: true},
    {name: 'X', x: width - 140, y: height - 110, scale: 1, show: true},
    {name: 'Y', x: width - 90, y: height - 160, scale: 1, show: true},
    {name: 'LeftThumb', x: 210, y: height - 80, scale: 1, show: true},
    {name: 'RightThumb', x: width - 235, y: height - 70, scale: 1, show: true},
    {name: 'View', x: viewLeft, y: height - 30, scale: 1, show: true},
    {name: 'Nexus', x: nexusLeft, y: height - 50, scale: 1, show: true},
    {name: 'Menu', x: menuLeft, y: height - 30, scale: 1, show: true},
    {name: 'DPadUp', x: 85, y: height - 145, show: true},
    {name: 'DPadLeft', x: 35, y: height - 95, show: true},
    {name: 'DPadDown', x: 85, y: height - 45, show: true},
    {name: 'DPadRight', x: 135, y: height - 95, show: true},
    {name: 'LeftStick', x: 175, y: height - 205, show: true},
    {name: 'RightStick', x: width - 265, y: height - 195, show: true},
    createDefaultMacroLayoutButton(width, height),
  ];
};
