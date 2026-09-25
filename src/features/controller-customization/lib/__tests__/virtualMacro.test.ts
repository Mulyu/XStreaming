import {
  VIRTUAL_MACRO_BUTTON_NAMES,
  isMacroButtonName,
  createDefaultMacroLayoutButtons,
  ensureMacroLayoutButtons,
  normalizeMacroStep,
  normalizeMacroSteps,
} from '../virtualMacro';

describe('isMacroButtonName', () => {
  it('recognizes exactly the three macro slots, in order', () => {
    expect(VIRTUAL_MACRO_BUTTON_NAMES).toEqual(['Macro1', 'Macro2', 'Macro3']);
    expect(isMacroButtonName('Macro1')).toBe(true);
    expect(isMacroButtonName('Macro3')).toBe(true);
  });

  it('rejects any other name, including the old single-button name', () => {
    expect(isMacroButtonName('Macro')).toBe(false);
    expect(isMacroButtonName('A')).toBe(false);
    expect(isMacroButtonName(undefined)).toBe(false);
  });
});

describe('createDefaultMacroLayoutButtons', () => {
  it('creates one non-overlapping button per slot', () => {
    const buttons = createDefaultMacroLayoutButtons(1000, 600);
    expect(buttons.map(b => b.name)).toEqual(['Macro1', 'Macro2', 'Macro3']);
    const ys = buttons.map(b => b.y);
    expect(new Set(ys).size).toBe(3);
    buttons.forEach(b => expect(b.show).toBe(true));
  });
});

describe('ensureMacroLayoutButtons', () => {
  const fallback = createDefaultMacroLayoutButtons(1000, 600);

  it('adds all three slots to a layout that predates macros entirely', () => {
    const layout = [{name: 'A', x: 0, y: 0, show: true}];
    const result = ensureMacroLayoutButtons(layout, fallback);
    expect(result.map((b: any) => b.name)).toEqual([
      'A',
      'Macro1',
      'Macro2',
      'Macro3',
    ]);
  });

  it('migrates a legacy single "Macro" button to Macro1 in place, keeping its position', () => {
    const layout = [
      {name: 'A', x: 0, y: 0, show: true},
      {name: 'Macro', x: 123, y: 456, show: true, scale: 2},
    ];
    const result = ensureMacroLayoutButtons(layout, fallback);
    const names = result.map((b: any) => b.name);
    // Migrated in place, not appended, and the old name is gone.
    expect(names).toEqual(['A', 'Macro1', 'Macro2', 'Macro3']);
    const macro1 = result.find((b: any) => b.name === 'Macro1');
    expect(macro1.x).toBe(123);
    expect(macro1.y).toBe(456);
    expect(macro1.scale).toBe(2);
  });

  it('does not touch an already-migrated layout', () => {
    const layout = [
      {name: 'Macro1', x: 1, y: 1, show: true},
      {name: 'Macro2', x: 2, y: 2, show: true},
      {name: 'Macro3', x: 3, y: 3, show: true},
    ];
    const result = ensureMacroLayoutButtons(layout, fallback);
    expect(result).toEqual(layout);
  });

  it('returns the fallback set for a non-array layout', () => {
    expect(ensureMacroLayoutButtons(null, fallback)).toEqual(fallback);
  });
});

describe('normalizeMacroStep / normalizeMacroSteps', () => {
  it('keeps multiple buttons in one step -- the X+Y-together use case', () => {
    const step = normalizeMacroStep({
      type: 'buttons',
      buttons: ['X', 'Y'],
      durationMs: 80,
    });
    expect(step.buttons.sort()).toEqual(['X', 'Y']);
  });

  it('drops disallowed button names and de-dupes', () => {
    const step = normalizeMacroStep({
      type: 'buttons',
      buttons: ['X', 'X', 'NotAButton'],
    });
    expect(step.buttons).toEqual(['X']);
  });

  it('falls back to an empty sequence (not a hardcoded default) for a missing steps array', () => {
    expect(normalizeMacroSteps(undefined)).toEqual([]);
  });
});
