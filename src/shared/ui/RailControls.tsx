import React from 'react';
import {Pressable, StyleSheet, StyleProp, View, ViewStyle} from 'react-native';
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
        styles.railBtn,
        focused && styles.railBtnFocused,
        iconOnly && styles.railBtnIconOnly,
        compact && styles.railBtnCompact,
        active &&
          !danger &&
          (fill
            ? {backgroundColor: accent, borderColor: accent}
            : styles.railBtnActive),
        compact && focused && styles.railBtnFocused,
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
            styles.railBtnLetter,
            compact && styles.railBtnLetterCompact,
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
        <Text
          style={[styles.railBtnLabel, {color: labelColor}]}
          numberOfLines={1}>
          {label}
        </Text>
      )}
      {trailingIcon && (
        <Icon source={trailingIcon} size={14} color={iconColor} />
      )}
      {!!badge && badge > 0 && (
        <View style={styles.railBadge} pointerEvents="none">
          <Text style={styles.railBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
};

export type RailSegmentOption = {
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
export const RailSegment: React.FC<{
  options: RailSegmentOption[];
  accent: string;
}> = ({options, accent}) => (
  <View style={styles.segment}>
    {options.map(option => (
      <RailSegmentItem key={option.key} option={option} accent={accent} />
    ))}
  </View>
);

const RailSegmentItem: React.FC<{
  option: RailSegmentOption;
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
        <Text style={[styles.railBtnLetterCompact, {color}]}>
          {option.letter}
        </Text>
      ) : option.icon ? (
        <Icon source={option.icon} size={20} color={color} />
      ) : null}
      {!!option.badge && option.badge > 0 && (
        <View style={styles.railBadge} pointerEvents="none">
          <Text style={styles.railBadgeText}>
            {option.badge > 99 ? '99+' : option.badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

// A square icon button for a rail's top row (Nexus, disconnect, close) and
// the volume row's mute toggle. The label is the accessibility label only.
export const RailIconButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  accent: string;
  active?: boolean;
  danger?: boolean;
}> = ({icon, label, onPress, accent, active, danger}) => {
  const [focused, setFocused] = React.useState(false);
  const color = danger ? palette.sale : active ? accent : palette.textSoft;
  return (
    <Pressable
      style={[styles.iconBtn, focused && styles.railBtnFocused]}
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{color: alpha(palette.white, 0.15)}}>
      <Icon source={icon} size={20} color={color} />
    </Pressable>
  );
};

// An on/off icon tile, four to a row (see RailTileRow). The name is shown by
// the rail beside the section label while the tile has focus, via
// onFocusLabel/onBlurLabel, so the row needs no text of its own.
export const RailTile: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  accent: string;
  active?: boolean;
  onFocusLabel?: (label: string) => void;
  onBlurLabel?: () => void;
}> = ({icon, label, onPress, accent, active, onFocusLabel, onBlurLabel}) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      style={[
        styles.tile,
        active && styles.tileActive,
        focused && styles.railBtnFocused,
      ]}
      accessibilityLabel={label}
      accessibilityState={{selected: !!active}}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocusLabel?.(label);
      }}
      onBlur={() => {
        setFocused(false);
        onBlurLabel?.();
      }}
      android_ripple={{color: alpha(palette.white, 0.15)}}>
      <Icon
        source={icon}
        size={22}
        color={active ? accent : palette.textSoft}
      />
    </Pressable>
  );
};

export const RailTileRow: React.FC<{children: React.ReactNode}> = ({
  children,
}) => <View style={styles.tileRow}>{children}</View>;

// A rail section's small heading, with the focused tile's name on its right.
export const RailSectionLabel: React.FC<{title: string; caption?: string}> = ({
  title,
  caption,
}) => (
  <View style={styles.sectionLabelRow}>
    <Text style={styles.sectionLabel}>{title}</Text>
    {!!caption && (
      <Text style={styles.sectionCaption} numberOfLines={1}>
        {caption}
      </Text>
    )}
  </View>
);

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
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.white, 0.05),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // 41 x 4 + 3 gaps of 4 = 176, inside a rail's 179 of content width.
  tileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tile: {
    width: 41,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.white, 0.03),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileActive: {
    backgroundColor: alpha(palette.white, 0.08),
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 4,
    minHeight: 11,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: palette.textDim,
  },
  sectionCaption: {
    flexShrink: 1,
    fontSize: 10,
    color: palette.textSoft,
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
  railBtnCompact: {
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
  railBadge: {
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
  railBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.onAccent,
    lineHeight: 14,
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
  railBtnLetterCompact: {
    fontSize: 12,
  },
  railBtnLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    flexShrink: 1,
  },
});
