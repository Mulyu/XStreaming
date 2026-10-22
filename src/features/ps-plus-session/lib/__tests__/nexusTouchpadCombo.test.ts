import {createNexusTouchpadCombo} from '../nexusTouchpadCombo';

const gp = (over: Record<string, any> = {}) => ({
  Nexus: 0,
  DPadUp: 0,
  DPadDown: 0,
  DPadLeft: 0,
  DPadRight: 0,
  Touchpad: 0,
  Touches: [],
  ...over,
});

describe('Nexus + D-pad touchpad combo', () => {
  it('passes the D-pad through untouched when Nexus is not held', () => {
    const combo = createNexusTouchpadCombo();
    const out = combo.apply(gp({DPadUp: 1}), 0);
    expect(out.DPadUp).toBe(1);
    expect(out.Nexus).toBe(0);
    expect(out.Touches).toEqual([]);
  });

  it('swipes the way the D-pad points while Nexus is held, hiding the D-pad', () => {
    const combo = createNexusTouchpadCombo();
    combo.apply(gp({Nexus: 1}), 0);
    const start = combo.apply(gp({Nexus: 1, DPadRight: 1}), 16);
    expect(start.DPadRight).toBe(0);
    expect(start.Touches).toHaveLength(1);
    expect(start.Touches[0].x).toBeCloseTo(0.2);
    const mid = combo.apply(gp({Nexus: 1, DPadRight: 1}), 16 + 70);
    expect(mid.Touches[0].x).toBeCloseTo(0.5);
    expect(mid.Touches[0].y).toBeCloseTo(0.5);
    expect(mid.Touches[0].id).toBe(start.Touches[0].id);
  });

  it.each([
    ['DPadUp', 'y', 0.8, 0.2],
    ['DPadDown', 'y', 0.2, 0.8],
    ['DPadLeft', 'x', 0.8, 0.2],
    ['DPadRight', 'x', 0.2, 0.8],
  ])('%s moves the finger %s from %f toward %f', (key, axis, from, to) => {
    const combo = createNexusTouchpadCombo();
    combo.apply(gp({Nexus: 1}), 0);
    const first = combo.apply(gp({Nexus: 1, [key]: 1}), 16);
    expect(first.Touches[0][axis as 'x' | 'y']).toBeCloseTo(from);
    const last = combo.apply(gp({Nexus: 1, [key]: 1}), 16 + 139);
    expect(Math.abs(last.Touches[0][axis as 'x' | 'y'] - to)).toBeLessThan(
      0.02,
    );
  });

  it('lifts the finger after the swipe and repeats while the direction stays held', () => {
    const combo = createNexusTouchpadCombo();
    const held = gp({Nexus: 1, DPadRight: 1});
    const first = combo.apply(held, 0);
    expect(first.Touches).toHaveLength(1);
    // Swipe over, within the gap before the next one: finger up.
    expect(combo.apply(held, 150).Touches).toEqual([]);
    expect(combo.apply(held, 200).Touches).toEqual([]);
    const second = combo.apply(held, 270);
    expect(second.Touches).toHaveLength(1);
    expect(second.Touches[0].id).not.toBe(first.Touches[0].id);
  });

  it('clicks on Nexus release when no swipe happened, as a short pulse', () => {
    const combo = createNexusTouchpadCombo();
    expect(combo.apply(gp({Nexus: 1}), 0).Nexus).toBe(0);
    expect(combo.apply(gp({Nexus: 1}), 100).Nexus).toBe(0);
    expect(combo.apply(gp(), 116).Nexus).toBe(1);
    expect(combo.apply(gp(), 200).Nexus).toBe(1);
    expect(combo.apply(gp(), 230).Nexus).toBe(0);
  });

  it('does not click after a swipe', () => {
    const combo = createNexusTouchpadCombo();
    combo.apply(gp({Nexus: 1, DPadLeft: 1}), 0);
    combo.apply(gp({Nexus: 1}), 50);
    expect(combo.apply(gp(), 100).Nexus).toBe(0);
  });

  it('keeps a direction used for a swipe from leaking out as a D-pad press', () => {
    const combo = createNexusTouchpadCombo();
    combo.apply(gp({Nexus: 1, DPadUp: 1}), 0);
    // Nexus released first, direction still held.
    const out = combo.apply(gp({DPadUp: 1}), 40);
    expect(out.DPadUp).toBe(0);
    // Once released and pressed again it is a real D-pad press.
    combo.apply(gp(), 400);
    expect(combo.apply(gp({DPadUp: 1}), 450).DPadUp).toBe(1);
  });

  it('leaves real touchpad fingers alone', () => {
    const combo = createNexusTouchpadCombo();
    const real = [{id: 3, x: 0.4, y: 0.4}];
    const out = combo.apply(gp({Nexus: 1, DPadRight: 1, Touches: real}), 16);
    expect(out.Touches).toBe(real);
  });

  it('does not modify the gpState it is given', () => {
    const combo = createNexusTouchpadCombo();
    const input = gp({Nexus: 1, DPadRight: 1});
    combo.apply(input, 0);
    expect(input.DPadRight).toBe(1);
    expect(input.Touches).toEqual([]);
  });
});
