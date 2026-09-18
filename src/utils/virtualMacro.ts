// Three independent macro button slots. Each one's action sequence lives on
// its own ButtonConfig entry (see gamepadLayout.ts) inside the active custom
// gamepad profile's saved layout -- there is no shared/global macro sequence
// anymore, so two profiles (or two of these three buttons) can each fire a
// completely different combo. A profile that doesn't want a given slot can
// just hide it (the same `show` toggle every other button already has).
export const VIRTUAL_MACRO_BUTTON_NAMES = [
  'Macro1',
  'Macro2',
  'Macro3',
] as const;
export type VirtualMacroButtonName =
  (typeof VIRTUAL_MACRO_BUTTON_NAMES)[number];

export const isMacroButtonName = (name: any): name is VirtualMacroButtonName =>
  VIRTUAL_MACRO_BUTTON_NAMES.includes(name);

// 1-indexed slot number (for the on-icon badge), or null for a non-macro name.
export const macroButtonNumber = (name: any): number | null => {
  const idx = VIRTUAL_MACRO_BUTTON_NAMES.indexOf(name);
  return idx === -1 ? null : idx + 1;
};

// All three slots share one icon shape (common/virtualgp.ts) distinguished by
// color rather than a printed number -- see macroSlotHueShift.
export const MACRO_ICON_KEY = 'Macro';

// Fixed hue step between macro slots. Rotating the profile's own theme
// primary color by this amount per slot keeps all three visually related to
// the theme while staying easy to tell apart at a glance during play.
export const MACRO_COLOR_HUE_STEP_DEG = 120;

export const macroSlotHueShift = (name: any): number => {
  const num = macroButtonNumber(name);
  return num === null ? 0 : (num - 1) * MACRO_COLOR_HUE_STEP_DEG;
};

export const VIRTUAL_MACRO_ALLOWED_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LeftShoulder',
  'RightShoulder',
  'LeftTrigger',
  'RightTrigger',
  'View',
  'Menu',
  'LeftThumb',
  'RightThumb',
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
  'Nexus',
] as const;

export type VirtualMacroStep = {
  type: 'buttons' | 'stick';
  buttons: string[];
  stick: 'left' | 'right';
  x: number;
  y: number;
  durationMs: number;
  waitAfterMs: number;
};

export const DEFAULT_VIRTUAL_MACRO_LOOP_INTERVAL_MS = 500;
export const DEFAULT_VIRTUAL_MACRO_STEPS: VirtualMacroStep[] = [];

// One default-positioned button per slot, stacked so they don't overlap.
// Placed away from the default layout's other controls (mid-left, above the
// swipe-aim pad) since, unlike A/B/X/Y, there's no natural "home" for them.
export const createDefaultMacroLayoutButtons = (
  width: number,
  height: number,
): any[] =>
  VIRTUAL_MACRO_BUTTON_NAMES.map((name, index) => ({
    name,
    x: Math.round(width * 0.5 - 30),
    y: Math.round(height - 130 - index * 70),
    scale: 1,
    show: true,
  }));

// Ensures a saved layout carries all three macro slots (older saved layouts
// predate this or only ever had the single 'Macro' button). A legacy 'Macro'
// entry is migrated in place to the 'Macro1' slot, keeping its position but
// -- since its action sequence used to live in global settings, not on the
// button itself -- starting with an empty sequence; the user re-adds it once
// under Macro1's own editor.
export const ensureMacroLayoutButtons = (
  buttons: any[],
  fallbackButtons: any[],
): any[] => {
  if (!Array.isArray(buttons)) {
    return [...fallbackButtons];
  }
  let next = buttons;
  const legacyIndex = next.findIndex(button => button?.name === 'Macro');
  if (legacyIndex !== -1 && !next.some(button => button?.name === 'Macro1')) {
    next = next.map((button, idx) =>
      idx === legacyIndex ? {...button, name: 'Macro1'} : button,
    );
  }
  const missing = fallbackButtons.filter(
    fallback => !next.some(button => button?.name === fallback.name),
  );
  return missing.length ? [...next, ...missing] : next;
};

export const normalizeMacroLoopIntervalMs = (value: any): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_VIRTUAL_MACRO_LOOP_INTERVAL_MS;
  }
  return Math.max(0, Math.min(10000, Math.round(num)));
};

const normalizeStickAxis = (value: any): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, Number(num.toFixed(2))));
};

export const normalizeMacroStep = (
  step: any,
  fallbackButton = 'A',
): VirtualMacroStep => {
  const stepType = step?.type === 'stick' ? 'stick' : 'buttons';
  const allowed = new Set<string>(VIRTUAL_MACRO_ALLOWED_BUTTONS);
  let buttons: string[] = [];
  if (Array.isArray(step?.buttons)) {
    buttons = step.buttons.filter((button: string) => allowed.has(button));
  } else if (typeof step?.button === 'string' && allowed.has(step.button)) {
    buttons = [step.button];
  }
  if (!buttons.length) {
    buttons = [fallbackButton];
  }

  const durationRaw = Number(step?.durationMs);
  const waitRaw = Number(step?.waitAfterMs);

  return {
    type: stepType,
    buttons: Array.from(new Set(buttons)),
    stick: step?.stick === 'right' ? 'right' : 'left',
    x: normalizeStickAxis(step?.x),
    y: normalizeStickAxis(step?.y),
    durationMs: Number.isFinite(durationRaw)
      ? Math.max(30, Math.min(5000, Math.round(durationRaw)))
      : 80,
    waitAfterMs: Number.isFinite(waitRaw)
      ? Math.max(0, Math.min(3000, Math.round(waitRaw)))
      : 0,
  };
};

export const normalizeMacroSteps = (
  steps: any,
  fallbackSteps: VirtualMacroStep[] = DEFAULT_VIRTUAL_MACRO_STEPS,
): VirtualMacroStep[] => {
  const fallbackButton = fallbackSteps[0]?.buttons?.[0] || 'A';
  if (!Array.isArray(steps)) {
    return fallbackSteps.map(step => ({...step}));
  }
  return steps.map(step => normalizeMacroStep(step, fallbackButton));
};
