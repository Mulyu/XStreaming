import React from 'react';
import {MOD_BIT_TO_VK} from './virtualKeys';

// Shared Shift/Ctrl/Alt/Win latch state for GFN's virtual keyboard surfaces
// (the full VirtualKeyboard overlay and any per-profile custom key buttons
// configured as one of these four keys -- see utils/virtualKeys.ts's
// VK_TO_MOD_BIT). Lifted up to NativeStream so a modifier latched from either
// surface is visible to the other: latch Shift from a custom key button, then
// tap a letter on the full keyboard (or another custom key button), and the
// Shift bit is included, matching a physical keyboard's behavior.
export type KeyboardModifiers = {
  latched: Set<number>;
  modifierMask: (excludeBit?: number) => number;
  toggleModifier: (vk: number, bit: number) => void;
  releaseAll: () => void;
};

export const useKeyboardModifiers = (
  onKeyDown: (virtualKey: number, modifiers: number) => void,
  onKeyUp: (virtualKey: number, modifiers: number) => void,
): KeyboardModifiers => {
  const [latched, setLatched] = React.useState<Set<number>>(new Set());
  const latchedRef = React.useRef(latched);
  latchedRef.current = latched;

  const modifierMask = React.useCallback((excludeBit?: number): number => {
    let mask = 0;
    latchedRef.current.forEach(bit => {
      if (bit !== excludeBit) {
        mask |= bit;
      }
    });
    return mask;
  }, []);

  const toggleModifier = React.useCallback(
    (vk: number, bit: number) => {
      const next = new Set(latchedRef.current);
      if (next.has(bit)) {
        next.delete(bit);
        onKeyUp(vk, modifierMask(bit));
      } else {
        next.add(bit);
        onKeyDown(vk, modifierMask(bit));
      }
      setLatched(next);
    },
    [modifierMask, onKeyDown, onKeyUp],
  );

  const releaseAll = React.useCallback(() => {
    latchedRef.current.forEach(bit => {
      const vk = MOD_BIT_TO_VK[bit];
      if (vk !== undefined) {
        onKeyUp(vk, 0);
      }
    });
    if (latchedRef.current.size > 0) {
      setLatched(new Set());
    }
  }, [onKeyUp]);

  return {latched, modifierMask, toggleModifier, releaseAll};
};
