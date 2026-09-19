import React from 'react';
import {View, StyleSheet} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import KeyChip from './CustomGamepad/KeyChip';
import {ButtonConfig} from '../utils/gamepadLayout';
import {VK_TO_MOD_BIT} from '../utils/virtualKeys';
import {KeyboardModifiers} from '../hooks/useKeyboardModifiers';

export type CustomKeyButtonsProps = {
  layout: ButtonConfig[];
  opacity: number;
  modifiers: KeyboardModifiers;
  onKeyDown: (virtualKey: number, modifiers: number) => void;
  onKeyUp: (virtualKey: number, modifiers: number) => void;
};

// One placed key button. A modifier key (Shift/Ctrl/Alt/Win) always shares
// the VirtualKeyboard overlay's own latch (VK_TO_MOD_BIT), regardless of its
// own holdToggle flag -- a modifier button that only stayed down while
// pressed would be no different from typing it on the full keyboard, and a
// second, separately-latching Shift concept here would just be confusing. A
// non-modifier key's own holdToggle instead latches just this one button's
// own local press.
const KeyButtonInstance: React.FC<{
  button: ButtonConfig;
  opacity: number;
  modifiers: KeyboardModifiers;
  onKeyDown: (virtualKey: number, modifiers: number) => void;
  onKeyUp: (virtualKey: number, modifiers: number) => void;
}> = ({button, opacity, modifiers, onKeyDown, onKeyUp}) => {
  const vk = button.keyVk!;
  const modBit = VK_TO_MOD_BIT[vk];
  const [localLatched, setLocalLatched] = React.useState(false);
  const localLatchedRef = React.useRef(false);

  // Releases a stuck-down local latch if this button is removed/hidden while
  // engaged (e.g. the profile is edited mid-session).
  React.useEffect(
    () => () => {
      if (localLatchedRef.current) {
        onKeyUp(vk, 0);
      }
    },
    [vk, onKeyUp],
  );

  // Same low-latency press detection as the other virtual gamepad buttons
  // (see CustomGamepad/GamepadButton.tsx) -- onPressIn/onPressOut alone
  // aren't as immediate for game input timing.
  const gesture = Gesture.LongPress()
    .onStart(() => {
      if (modBit !== undefined) {
        modifiers.toggleModifier(vk, modBit);
        return;
      }
      if (button.holdToggle) {
        const next = !localLatchedRef.current;
        localLatchedRef.current = next;
        setLocalLatched(next);
        if (next) {
          onKeyDown(vk, modifiers.modifierMask());
        } else {
          onKeyUp(vk, modifiers.modifierMask());
        }
        return;
      }
      onKeyDown(vk, modifiers.modifierMask());
    })
    .onEnd(() => {
      if (modBit !== undefined || button.holdToggle) {
        return;
      }
      onKeyUp(vk, modifiers.modifierMask());
    })
    .minDuration(16);

  const active =
    modBit !== undefined ? modifiers.latched.has(modBit) : localLatched;

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.button, {top: button.y, left: button.x, opacity}]}>
        <KeyChip
          label={button.keyLabel || '?'}
          width={button.width ?? 50}
          height={button.height ?? 50}
          scale={button.scale ?? 1}
          style={active ? styles.active : undefined}
        />
      </View>
    </GestureDetector>
  );
};

// Renders every kind:'key' button from the active profile's layout on top of
// the game view -- GFN + Native touch only (see NativeStream.tsx), alongside
// (not instead of) the full VirtualKeyboard overlay, sharing its modifier
// latch via the `modifiers` controller.
const CustomKeyButtons: React.FC<CustomKeyButtonsProps> = ({
  layout,
  opacity,
  modifiers,
  onKeyDown,
  onKeyUp,
}) => {
  const keyButtons = layout.filter(
    b => b.kind === 'key' && b.show !== false && typeof b.keyVk === 'number',
  );
  if (keyButtons.length === 0) {
    return null;
  }
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {keyButtons.map(button => (
        <KeyButtonInstance
          key={button.name}
          button={button}
          opacity={opacity}
          modifiers={modifiers}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 9,
  },
  button: {
    position: 'absolute',
    zIndex: 10,
  },
  active: {
    backgroundColor: 'rgba(118,185,0,0.35)',
    borderColor: '#76B900',
  },
});

export default CustomKeyButtons;
