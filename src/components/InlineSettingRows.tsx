import React from 'react';
import {View, StyleSheet, Pressable, ScrollView} from 'react-native';
import {Text, Switch, Menu, Divider} from 'react-native-paper';
import RNSlider from '@react-native-community/slider';

// Xbox/GeForce NOW accent colors, matching Library.tsx's own tone -- reused
// here so the "on" state of a switch/segmented/dropdown reads as the same
// system as the availability dots and filter chips on the Library screen.
export const XBOX_ACCENT = '#107C10';
export const NVIDIA_ACCENT = '#76B900';

export type SettingOption = {value: any; text: string};

type RowShellProps = {
  title: string;
  desc?: string;
  flag?: string;
  tail?: React.ReactNode;
  children?: React.ReactNode;
  onPress?: () => void;
};

// Every inline row shares this shape: a title line, then a line pairing the
// description (left) with the current value / control (right, "tail") --
// the "value stays on the description's line, right-aligned" layout asked
// for instead of the value getting its own row. `children` is for a control
// that genuinely needs its own line below (a slider track, an expanded
// swatch strip) since it can't be squeezed onto the description's line.
const RowShell: React.FC<RowShellProps> = ({
  title,
  desc,
  flag,
  tail,
  children,
  onPress,
}) => {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <>
      <Wrapper style={styles.row} onPress={onPress}>
        <Text style={styles.rowTitle}>{title}</Text>
        <View style={styles.metaLine}>
          {desc ? (
            <Text style={styles.rowDesc} numberOfLines={2}>
              {desc}
            </Text>
          ) : (
            <View style={styles.flexFill} />
          )}
          {tail}
        </View>
        {flag ? <Text style={styles.rowFlag}>{flag}</Text> : null}
        {children}
      </Wrapper>
      <Divider style={styles.divider} />
    </>
  );
};

export const InfoRow: React.FC<{
  title: string;
  value: string;
  accent?: string;
}> = ({title, value, accent = XBOX_ACCENT}) => (
  <RowShell
    title={title}
    tail={<Text style={[styles.infoValue, {color: accent}]}>{value}</Text>}
  />
);

export const SwitchRow: React.FC<{
  title: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  flag?: string;
  accent?: string;
}> = ({title, desc, value, onChange, flag, accent = XBOX_ACCENT}) => (
  <RowShell
    title={title}
    desc={desc}
    flag={flag}
    tail={
      <Switch
        value={!!value}
        onValueChange={onChange}
        color={accent}
        // Compact, native-feeling hit target without the paper default's
        // extra surrounding margin, so it sits flush against the row edge.
        style={styles.switchTrim}
      />
    }
  />
);

export const SegmentedRow: React.FC<{
  title: string;
  desc?: string;
  options: SettingOption[];
  value: any;
  onChange: (v: any) => void;
  flag?: string;
  accent?: string;
}> = ({title, desc, options, value, onChange, flag, accent = XBOX_ACCENT}) => (
  <RowShell
    title={title}
    desc={desc}
    flag={flag}
    tail={
      <View style={styles.segmented}>
        {options.map((opt, idx) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={idx}
              onPress={() => onChange(opt.value)}
              style={[
                styles.chip,
                active && {backgroundColor: accent, borderColor: accent},
              ]}>
              <Text style={[styles.chipText, active && styles.chipTextOn]}>
                {opt.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    }
  />
);

export const DropdownRow: React.FC<{
  title: string;
  desc?: string;
  options: SettingOption[];
  value: any;
  onChange: (v: any) => void;
  flag?: string;
  accent?: string;
  emptyLabel?: string;
}> = ({
  title,
  desc,
  options,
  value,
  onChange,
  flag,
  accent = XBOX_ACCENT,
  emptyLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const current = options.find(o => o.value === value);
  const currentLabel = current?.text ?? emptyLabel ?? String(value ?? '');
  return (
    <RowShell
      title={title}
      desc={desc}
      flag={flag}
      tail={
        <Menu
          visible={open}
          onDismiss={() => setOpen(false)}
          anchor={
            <Pressable
              onPress={() => setOpen(true)}
              style={styles.dropdownPill}>
              <Text style={styles.dropdownPillText} numberOfLines={1}>
                {currentLabel}
              </Text>
              <Text style={[styles.dropdownCaret, {color: accent}]}>▾</Text>
            </Pressable>
          }
          contentStyle={styles.dropdownMenuContent}>
          <ScrollView style={styles.dropdownMenuScroll}>
            {options.map((opt, idx) => (
              <Menu.Item
                key={idx}
                title={opt.text}
                titleStyle={
                  opt.value === value
                    ? [styles.dropdownOptTextOn, {color: accent}]
                    : styles.dropdownOptText
                }
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </Menu>
      }
    />
  );
};

export const SliderRow: React.FC<{
  title: string;
  desc?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  flag?: string;
  accent?: string;
}> = ({
  title,
  desc,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  flag,
  accent = XBOX_ACCENT,
}) => {
  const [live, setLive] = React.useState(value);
  React.useEffect(() => setLive(value), [value]);
  return (
    <RowShell
      title={title}
      desc={desc}
      flag={flag}
      tail={
        <Text style={styles.sliderValue}>
          {formatValue ? formatValue(live) : String(live)}
        </Text>
      }>
      <RNSlider
        style={styles.sliderTrack}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={setLive}
        onSlidingComplete={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor="rgba(140,140,150,0.3)"
        thumbTintColor={accent}
      />
    </RowShell>
  );
};

export const SwatchRow: React.FC<{
  title: string;
  desc?: string;
  colors: string[];
  value: string;
  onChange: (v: string) => void;
}> = ({title, desc, colors, value, onChange}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <RowShell
      title={title}
      desc={desc}
      onPress={() => setOpen(o => !o)}
      tail={<View style={[styles.swatchDot, {backgroundColor: value}]} />}>
      {open && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.swatchStrip}
          contentContainerStyle={styles.swatchStripContent}>
          {colors.map(c => (
            <Pressable
              key={c}
              onPress={() => {
                onChange(c);
                setOpen(false);
              }}
              style={[
                styles.swatchOpt,
                {backgroundColor: c},
                c === value && styles.swatchOptActive,
              ]}
            />
          ))}
        </ScrollView>
      )}
    </RowShell>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  divider: {marginHorizontal: 16},
  rowTitle: {fontSize: 15, fontWeight: '600'},
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  flexFill: {flex: 1},
  rowDesc: {fontSize: 12, color: '#8A9A92', flex: 1, minWidth: 0},
  rowFlag: {fontSize: 10.5, color: '#E67E22', marginTop: 1},
  switchTrim: {marginVertical: -6, marginRight: -6},

  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  chipText: {fontSize: 11, fontWeight: '700', color: '#8A9A92'},
  chipTextOn: {color: '#0B0F0C'},

  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
    maxWidth: 190,
  },
  dropdownPillText: {fontSize: 11.5, fontWeight: '700', color: '#8A9A92'},
  dropdownCaret: {fontSize: 9},
  dropdownMenuContent: {maxHeight: 320},
  dropdownMenuScroll: {maxHeight: 320},
  dropdownOptText: {fontSize: 13, color: '#8A9A92'},
  dropdownOptTextOn: {fontSize: 13, fontWeight: '700'},

  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sliderValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A9A92',
    fontVariant: ['tabular-nums'],
  },
  sliderTrack: {width: '100%', height: 28, marginTop: -4},

  swatchDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  swatchStrip: {marginTop: 4},
  swatchStripContent: {gap: 8, paddingRight: 8},
  swatchOpt: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  swatchOptActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
});
