import React from 'react';
import {Pressable, StyleSheet, StyleProp, View, ViewStyle} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {TV_FOCUS_COLOR} from './tvFocus';
import {alpha, palette} from '../config/palette';

// The app's shared buttons: AppButton (icon or letter + label), ToggleGroup (a
// pill of independent toggles) and SegmentOption (one option of a segmented
// control). Started as the in-stream control rails' buttons and now used by
// Library, Store and the stream screens alike. Plain onFocus/onBlur + local
// useState border ring -- confirmed to read clearly on real Google TV
// hardware (see shared/ui/tvFocus.ts's own history), so every screen that
// needs this look gets the same proven behavior instead of its own
// re-implementation. Prefer these on TV over a one-off Pressable.

export const AppButton: React.FC<{
  // Exactly one of icon/letter is expected -- icon for the stream control rails'
  // MDI glyphs, letter for Library's X/N/PS provider badges (no MDI glyph
  // carries those services' identity the way this app's own letter-badge
  // convention already does everywhere else, e.g. the title grid's badges).
  icon?: string;
  letter?: string;
  // Library's sort button only -- the open/closed chevron, colored the same
  // way the leading icon/letter is.
  trailingIcon?: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  accent: string;
  // Library's filter chips use a solid accent fill for "on" -- a pre-
  // existing app convention stronger than this rail's own subtle highlight.
  // The in-stream rails keep their original tint by leaving this unset.
  fill?: boolean;
  // Icon (or letter) only, no visible label -- the label stays as the
  // accessibility label. For dense toolbars (Library's TV filter row).
  iconOnly?: boolean;
  // Phone toolbars: a smaller (34dp) icon chip with the app's pill-chip
  // look -- subtle fill and border when off, solid accent when on -- instead
  // of the 46dp TV button. Only meaningful together with iconOnly.
  compact?: boolean;
  // A small count balloon on the button's corner (hidden at 0 or unset) --
  // Library's wishlist chip uses it for "this many wishlisted titles are on
  // sale".
  badge?: number;
  // TV: take the D-pad focus as soon as the button appears (a screen whose
  // only action this is, e.g. the stream start-up screen's Cancel).
  preferFocus?: boolean;
  // Layout overrides from the parent (e.g. flexGrow for a wide search button).
  style?: StyleProp<ViewStyle>;
}> = ({
  icon,
  letter,
  trailingIcon,
  label,
  onPress,
  active,
  danger,
  accent,
  fill,
  iconOnly,
  compact,
  badge,
  preferFocus,
  style,
}) => {
  const [focused, setFocused] = React.useState(false);
  const iconColor = danger
    ? palette.sale
    : active
    ? fill
      ? palette.onAccent
      : accent
    : palette.textSoft;
  const labelColor = danger
    ? palette.sale
    : active && fill
    ? palette.onAccent
    : palette.text;
  return (
    <Pressable
      style={[
        styles.btn,
        focused && styles.btnFocused,
        iconOnly && styles.btnIconOnly,
        compact && styles.btnCompact,
        active &&
          !danger &&
          (fill
            ? {backgroundColor: accent, borderColor: accent}
            : styles.btnActive),
        compact && focused && styles.btnFocused,
        style,
      ]}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferFocus}
      android_ripple={{color: alpha(palette.white, 0.15)}}>
      {letter ? (
        <Text
          style={[
            styles.btnLetter,
            compact && styles.btnLetterCompact,
            {color: iconColor},
          ]}>
          {letter}
        </Text>
      ) : icon ? (
        <Icon
          source={icon}
          size={compact ? 20 : iconOnly ? 22 : 18}
          color={iconColor}
        />
      ) : null}
      {!iconOnly && (
        <Text style={[styles.btnLabel, {color: labelColor}]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {trailingIcon && (
        <Icon source={trailingIcon} size={14} color={iconColor} />
      )}
      {!!badge && badge > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
};

export type ToggleGroupOption = {
  key: string;
  // Exactly one of letter/icon.
  letter?: string;
  icon?: string;
  label: string;
  active: boolean;
  onPress: () => void;
  // Count balloon on the option's corner (hidden at 0 or unset).
  badge?: number;
};

// A phone-toolbar group of related toggles drawn as one rounded pill (the
// provider letters, the favorite/wishlist pair) instead of one chip each, so
// the whole filter row fits on one line. Each option is still its own
// button: it toggles on and off independently, same as the chips it replaces.
export const ToggleGroup: React.FC<{
  options: ToggleGroupOption[];
  accent: string;
}> = ({options, accent}) => (
  <View style={styles.segment}>
    {options.map(option => (
      <ToggleGroupItem key={option.key} option={option} accent={accent} />
    ))}
  </View>
);

const ToggleGroupItem: React.FC<{
  option: ToggleGroupOption;
  accent: string;
}> = ({option, accent}) => {
  const [focused, setFocused] = React.useState(false);
  const color = option.active ? palette.onAccent : palette.textSoft;
  return (
    <Pressable
      style={[
        styles.segmentItem,
        option.active && {backgroundColor: accent},
        focused && styles.segmentItemFocused,
      ]}
      accessibilityLabel={option.label}
      accessibilityState={{selected: option.active}}
      onPress={option.onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: alpha(palette.white, 0.15)}}>
      {option.letter ? (
        <Text style={[styles.btnLetterCompact, {color}]}>{option.letter}</Text>
      ) : option.icon ? (
        <Icon source={option.icon} size={20} color={color} />
      ) : null}
      {!!option.badge && option.badge > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>
            {option.badge > 99 ? '99+' : option.badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

export const SegmentOption: React.FC<{
  icon: string;
  label: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}> = ({icon, label, active, accent, onPress}) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      style={[
        styles.segmentOpt,
        active && {backgroundColor: accent},
        focused && styles.segmentOptFocused,
      ]}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: alpha(palette.white, 0.2)}}>
      <Icon
        source={icon}
        size={18}
        color={active ? palette.onAccent : palette.textSoft}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  segmentOpt: {
    flex: 1,
    height: 34,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptFocused: {
    borderWidth: 2,
    borderColor: TV_FOCUS_COLOR,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: alpha(palette.white, 0.03),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  btnIconOnly: {
    minWidth: 46,
    height: 46,
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 10,
  },
  btnCompact: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    gap: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.24),
    backgroundColor: alpha(palette.text, 0.14),
  },
  segment: {
    flexDirection: 'row',
    height: 34,
    padding: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.24),
    backgroundColor: alpha(palette.text, 0.14),
  },
  segmentItem: {
    minWidth: 27,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentItemFocused: {
    borderColor: TV_FOCUS_COLOR,
  },
  badge: {
    position: 'absolute',
    top: -9,
    right: -9,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 2,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sale,
    borderWidth: 2,
    borderColor: palette.bg,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.onAccent,
    lineHeight: 14,
  },
  btnFocused: {
    borderColor: TV_FOCUS_COLOR,
  },
  btnActive: {
    backgroundColor: alpha(palette.white, 0.07),
  },
  btnLetter: {
    fontSize: 13,
    fontWeight: '800',
  },
  btnLetterCompact: {
    fontSize: 12,
  },
  btnLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    flexShrink: 1,
  },
});
