import React from 'react';
import {Pressable, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {TV_FOCUS_COLOR} from './tvFocus';
import {alpha, palette} from '../config/palette';

// The in-stream control rails' (StreamControlRail/PsPlusControlRail) icon +
// label button and segmented-control option, pulled out here after Library
// needed a third near-identical copy for its own TV filter/sort row. Plain
// onFocus/onBlur + local useState border ring -- confirmed to read clearly
// on real Google TV hardware (see shared/ui/tvFocus.ts's own history), so
// every screen that needs this look gets the same proven behavior instead
// of its own re-implementation.

export const RailButton: React.FC<{
  // Exactly one of icon/letter is expected -- icon for the in-stream rails'
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
        styles.railBtn,
        focused && styles.railBtnFocused,
        iconOnly && styles.railBtnIconOnly,
        active &&
          !danger &&
          (fill ? {backgroundColor: accent} : styles.railBtnActive),
        style,
      ]}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: alpha(palette.white, 0.15)}}>
      {letter ? (
        <Text style={[styles.railBtnLetter, {color: iconColor}]}>{letter}</Text>
      ) : icon ? (
        <Icon source={icon} size={iconOnly ? 22 : 18} color={iconColor} />
      ) : null}
      {!iconOnly && (
        <Text
          style={[styles.railBtnLabel, {color: labelColor}]}
          numberOfLines={1}>
          {label}
        </Text>
      )}
      {trailingIcon && (
        <Icon source={trailingIcon} size={14} color={iconColor} />
      )}
    </Pressable>
  );
};

export const SegOption: React.FC<{
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
        styles.segOpt,
        active && {backgroundColor: accent},
        focused && styles.segOptFocused,
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
  segOpt: {
    flex: 1,
    height: 34,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOptFocused: {
    borderWidth: 2,
    borderColor: TV_FOCUS_COLOR,
  },
  railBtn: {
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
  railBtnIconOnly: {
    minWidth: 46,
    height: 46,
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 10,
  },
  railBtnFocused: {
    borderColor: TV_FOCUS_COLOR,
  },
  railBtnActive: {
    backgroundColor: alpha(palette.white, 0.07),
  },
  railBtnLetter: {
    fontSize: 13,
    fontWeight: '800',
  },
  railBtnLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    flexShrink: 1,
  },
});
