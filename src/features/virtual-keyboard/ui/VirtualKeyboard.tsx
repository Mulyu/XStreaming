import React from 'react';
import {View, StyleSheet, Pressable, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Icon} from 'react-native-paper';
import {
  KEY_MOD_ALT,
  KEY_MOD_CTRL,
  KEY_MOD_META,
  KEY_MOD_SHIFT,
  VK,
} from '../../../entities/gfn-input';
import type {KeyboardModifiers} from '../lib/useKeyboardModifiers';

const ACCENT = '#76B900'; // GFN-only feature -- always the NVIDIA accent.
const FOCUS_COLOR = '#FFD54A';

type KeyDef = {
  label: string;
  vk: number;
  flex: number;
  // Latching modifier (Shift/Ctrl/Alt/Win): a tap toggles it on until tapped
  // again, instead of a momentary press -- holding a small on-screen key with
  // one finger while tapping another with the same hand isn't practical, so
  // modifiers latch rather than requiring a continuous hold (mirrors the
  // per-profile "hold like a toggle" behavior on virtual gamepad buttons).
  modBit?: number;
  mono?: boolean;
};

const key = (label: string, vk: number, flex = 1, mono = false): KeyDef => ({
  label,
  vk,
  flex,
  mono,
});

const modKey = (
  label: string,
  vk: number,
  flex: number,
  modBit: number,
): KeyDef => ({
  label,
  vk,
  flex,
  modBit,
  mono: true,
});

const FUNCTION_ROW: KeyDef[] = [
  key('Esc', VK.Escape, 1.3, true),
  key('F1', VK.F1, 1, true),
  key('F2', VK.F2, 1, true),
  key('F3', VK.F3, 1, true),
  key('F4', VK.F4, 1, true),
  key('F5', VK.F5, 1, true),
  key('F6', VK.F6, 1, true),
  key('F7', VK.F7, 1, true),
  key('F8', VK.F8, 1, true),
  key('F9', VK.F9, 1, true),
  key('F10', VK.F10, 1, true),
  key('F11', VK.F11, 1, true),
  key('F12', VK.F12, 1, true),
];

const MAIN_ROWS: KeyDef[][] = [
  [
    key('`', VK.Backquote),
    key('1', VK.Digit1),
    key('2', VK.Digit2),
    key('3', VK.Digit3),
    key('4', VK.Digit4),
    key('5', VK.Digit5),
    key('6', VK.Digit6),
    key('7', VK.Digit7),
    key('8', VK.Digit8),
    key('9', VK.Digit9),
    key('0', VK.Digit0),
    key('-', VK.Minus),
    key('=', VK.Equal),
    key('⌫', VK.Backspace, 1.7),
  ],
  [
    key('Tab', VK.Tab, 1.5, true),
    key('Q', VK.Q),
    key('W', VK.W),
    key('E', VK.E),
    key('R', VK.R),
    key('T', VK.T),
    key('Y', VK.Y),
    key('U', VK.U),
    key('I', VK.I),
    key('O', VK.O),
    key('P', VK.P),
    key('[', VK.BracketLeft),
    key(']', VK.BracketRight),
    key('\\', VK.Backslash, 1.2),
  ],
  [
    key('Caps', VK.CapsLock, 1.75, true),
    key('A', VK.A),
    key('S', VK.S),
    key('D', VK.D),
    key('F', VK.F),
    key('G', VK.G),
    key('H', VK.H),
    key('J', VK.J),
    key('K', VK.K),
    key('L', VK.L),
    key(';', VK.Semicolon),
    key("'", VK.Quote),
    key('Enter', VK.Enter, 2, true),
  ],
  [
    modKey('Shift', VK.LeftShift, 2.25, KEY_MOD_SHIFT),
    key('Z', VK.Z),
    key('X', VK.X),
    key('C', VK.C),
    key('V', VK.V),
    key('B', VK.B),
    key('N', VK.N),
    key('M', VK.M),
    key(',', VK.Comma),
    key('.', VK.Period),
    key('/', VK.Slash),
    modKey('Shift', VK.LeftShift, 2, KEY_MOD_SHIFT),
  ],
];

const BOTTOM_ROW: KeyDef[] = [
  modKey('Ctrl', VK.LeftCtrl, 1.5, KEY_MOD_CTRL),
  modKey('Win', VK.Meta, 1.2, KEY_MOD_META),
  modKey('Alt', VK.LeftAlt, 1.2, KEY_MOD_ALT),
  key('Space', VK.Space, 6.5, true),
  modKey('Alt', VK.LeftAlt, 1.2, KEY_MOD_ALT),
  modKey('Ctrl', VK.LeftCtrl, 1.5, KEY_MOD_CTRL),
];

const NAV_KEYS: KeyDef[] = [
  key('Ins', VK.Insert, 1, true),
  key('Home', VK.Home, 1, true),
  key('PgUp', VK.PageUp, 1, true),
  key('Del', VK.Delete, 1, true),
  key('End', VK.End, 1, true),
  key('PgDn', VK.PageDown, 1, true),
];

const ARROW_KEYS: {label: string; vk: number; icon: string}[] = [
  {label: 'up', vk: VK.Up, icon: 'chevron-up'},
  {label: 'left', vk: VK.Left, icon: 'chevron-left'},
  {label: 'down', vk: VK.Down, icon: 'chevron-down'},
  {label: 'right', vk: VK.Right, icon: 'chevron-right'},
];

export type VirtualKeyboardProps = {
  visible: boolean;
  onClose: () => void;
  onKeyDown: (virtualKey: number, modifiers: number) => void;
  onKeyUp: (virtualKey: number, modifiers: number) => void;
  // Shift/Ctrl/Alt/Win latch state, shared with any custom key buttons
  // configured as one of those keys -- see features/virtual-keyboard.
  modifiers: KeyboardModifiers;
};

const KeyButton: React.FC<{
  def: KeyDef;
  active: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}> = ({def, active, onPressIn, onPressOut}) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      style={[
        styles.key,
        {flex: def.flex},
        active && styles.keyActive,
        focused && styles.keyFocused,
      ]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{color: 'rgba(255,255,255,0.15)'}}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}>
      <Text
        style={[
          def.mono ? styles.keyLabelMono : styles.keyLabel,
          active && styles.keyLabelActive,
        ]}
        numberOfLines={1}>
        {def.label}
      </Text>
    </Pressable>
  );
};

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  visible,
  onClose,
  onKeyDown,
  onKeyUp,
  modifiers,
}) => {
  const {t} = useTranslation();
  // Non-modifier keys currently physically held on THIS panel, tracked only
  // so a hide/unmount mid-press can release them instead of leaving a key
  // stuck down on the remote OS. Modifier latch state itself lives in the
  // shared `modifiers` controller (see the prop's doc).
  const heldRef = React.useRef<Set<number>>(new Set());

  const releaseHeld = React.useCallback(() => {
    heldRef.current.forEach(vk => onKeyUp(vk, 0));
    heldRef.current.clear();
  }, [onKeyUp]);

  React.useEffect(() => {
    if (!visible) {
      releaseHeld();
    }
  }, [visible, releaseHeld]);

  // Releases held keys on unmount too (e.g. leaving the stream while the
  // keyboard is up), same as GfnTouchGestureTracker.dispose().
  React.useEffect(() => releaseHeld, [releaseHeld]);

  if (!visible) {
    return null;
  }

  const handleKeyPressIn = (def: KeyDef) => {
    heldRef.current.add(def.vk);
    onKeyDown(def.vk, modifiers.modifierMask());
  };

  const handleKeyPressOut = (def: KeyDef) => {
    heldRef.current.delete(def.vk);
    onKeyUp(def.vk, modifiers.modifierMask());
  };

  const renderKey = (def: KeyDef, index: number) => {
    if (def.modBit) {
      const active = modifiers.latched.has(def.modBit);
      return (
        <KeyButton
          key={`${def.label}-${index}`}
          def={def}
          active={active}
          onPressIn={() => {}}
          onPressOut={() => modifiers.toggleModifier(def.vk, def.modBit!)}
        />
      );
    }
    return (
      <KeyButton
        key={`${def.label}-${index}`}
        def={def}
        active={false}
        onPressIn={() => handleKeyPressIn(def)}
        onPressOut={() => handleKeyPressOut(def)}
      />
    );
  };

  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('Keyboard')}</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          android_ripple={{color: 'rgba(255,255,255,0.15)'}}>
          <Icon source="close" size={14} color="#8a9a92" />
        </Pressable>
      </View>

      <View style={styles.keyWell}>
        <View style={styles.mainBlock}>
          <View style={[styles.row, styles.funcRow]}>
            {FUNCTION_ROW.map(renderKey)}
          </View>
          {MAIN_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map(renderKey)}
            </View>
          ))}
          <View style={styles.row}>{BOTTOM_ROW.map(renderKey)}</View>
        </View>

        <View style={styles.navCluster}>
          <View style={styles.navRow}>
            {NAV_KEYS.slice(0, 3).map(renderKey)}
          </View>
          <View style={[styles.navRow, styles.navRowTall]}>
            {NAV_KEYS.slice(3, 6).map(renderKey)}
          </View>
          <View style={styles.navSpacer} />
          <View style={styles.arrowCluster}>
            <View style={styles.arrowRow}>
              <View style={styles.arrowGap} />
              <Pressable
                style={styles.arrowKey}
                onPressIn={() =>
                  handleKeyPressIn({label: 'up', vk: VK.Up, flex: 1})
                }
                onPressOut={() =>
                  handleKeyPressOut({label: 'up', vk: VK.Up, flex: 1})
                }>
                <Icon source={ARROW_KEYS[0].icon} size={14} color="#eef4ef" />
              </Pressable>
              <View style={styles.arrowGap} />
            </View>
            <View style={styles.arrowRow}>
              {[ARROW_KEYS[1], ARROW_KEYS[2], ARROW_KEYS[3]].map(a => (
                <Pressable
                  key={a.label}
                  style={styles.arrowKey}
                  onPressIn={() =>
                    handleKeyPressIn({label: a.label, vk: a.vk, flex: 1})
                  }
                  onPressOut={() =>
                    handleKeyPressOut({label: a.label, vk: a.vk, flex: 1})
                  }>
                  <Icon source={a.icon} size={14} color="#eef4ef" />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,11,10,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(238,244,239,0.14)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    zIndex: 90,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(238,244,239,0.18)',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#eef4ef',
  },
  closeBtn: {
    marginLeft: 'auto',
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWell: {
    flexDirection: 'row',
    gap: 16,
    height: 264,
  },
  mainBlock: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  funcRow: {
    flex: 0.65,
  },
  key: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyActive: {
    backgroundColor: 'rgba(118,185,0,0.22)',
    borderColor: ACCENT,
    borderWidth: 2,
  },
  keyFocused: {
    borderColor: FOCUS_COLOR,
    borderWidth: 2,
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#eef4ef',
  },
  keyLabelMono: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#eef4ef',
  },
  keyLabelActive: {
    color: '#a7e04a',
  },
  navCluster: {
    width: 172,
    gap: 4,
  },
  navRow: {
    flexDirection: 'row',
    gap: 4,
    flex: 0.65,
  },
  navRowTall: {
    flex: 1,
  },
  navSpacer: {
    flex: 1,
  },
  arrowCluster: {
    gap: 4,
    height: 88,
  },
  arrowRow: {
    flexDirection: 'row',
    gap: 4,
    height: 42,
  },
  arrowGap: {
    flex: 1,
  },
  arrowKey: {
    flex: 1,
    height: '100%',
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(238,244,239,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VirtualKeyboard;
