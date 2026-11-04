import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text, Icon, Divider} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useTVFocus, tvFocusBold, tvFocusRow} from './tvFocus';
import {alpha, palette} from '../config/palette';

// Settings rows, the same on phone and TV. A value is never changed in place
// (tiny chips, a dropdown anchored to a pill and a slider track are hard on a
// remote and crowd a phone): every row is one line -- the title and the current
// value -- and pressing it opens a dialog that picks the value. What the
// setting does is explained in that dialog, not in the list.

type Option = {value: any; text: string};

type ValueRowProps = {
  title: string;
  // Shown on the right.
  value: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

// A list row: the title and the current value, nothing else.
const ValueRow: React.FC<ValueRowProps> = ({
  title,
  value,
  onPress,
  onLongPress,
}) => {
  const focus = useTVFocus();
  const interactive = !!(onPress || onLongPress);
  return (
    <>
      <Pressable
        style={[styles.row, interactive && focus.focused && tvFocusRow]}
        onPress={onPress}
        onLongPress={onLongPress}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        disabled={!interactive}
        accessibilityRole={interactive ? 'button' : undefined}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.rowValue}>{value}</View>
        {!!onPress && (
          <Icon source="chevron-right" size={20} color={palette.textSoft} />
        )}
      </Pressable>
      <Divider style={styles.divider} />
    </>
  );
};

const ValueText: React.FC<{text: string; accent: string}> = ({
  text,
  accent,
}) => (
  <Text style={[styles.valueText, {color: accent}]} numberOfLines={1}>
    {text}
  </Text>
);

// ---- dialog pieces ----

const Dialog: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({title, desc, flag, onClose, children, footer}) => (
  <Modal transparent animationType="fade" visible onRequestClose={onClose}>
    <View style={styles.scrim}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{title}</Text>
        {(!!desc || !!flag) && (
          <ScrollView style={styles.dialogDescScroll}>
            {!!desc && <Text style={styles.dialogDesc}>{desc}</Text>}
            {!!flag && <Text style={styles.dialogFlag}>{flag}</Text>}
          </ScrollView>
        )}
        <View style={styles.dialogBody}>{children}</View>
        {!!footer && <View style={styles.dialogFooter}>{footer}</View>}
      </View>
    </View>
  </Modal>
);

const DialogButton: React.FC<{
  label: string;
  onPress: () => void;
  primary?: boolean;
  accent?: string;
  preferFocus?: boolean;
  disabled?: boolean;
  minWidth?: number;
}> = ({label, onPress, primary, accent, preferFocus, disabled, minWidth}) => {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[
        styles.button,
        minWidth ? {minWidth} : null,
        primary && {backgroundColor: accent ?? palette.accent},
        disabled && styles.buttonDisabled,
        focus.focused && tvFocusBold,
      ]}
      onPress={disabled ? undefined : onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hasTVPreferredFocus={preferFocus}
      accessibilityRole="button">
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
};

const OptionItem: React.FC<{
  label: string;
  active: boolean;
  accent: string;
  preferFocus: boolean;
  onPress: () => void;
}> = ({label, active, accent, preferFocus, onPress}) => {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[styles.option, focus.focused && tvFocusRow]}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hasTVPreferredFocus={preferFocus}
      accessibilityRole="button"
      accessibilityState={{selected: active}}>
      <Text
        style={[styles.optionText, active && {color: accent}]}
        numberOfLines={2}>
        {label}
      </Text>
      {active && <Icon source="check" size={20} color={accent} />}
    </Pressable>
  );
};

// ---- rows ----

export const ChoiceRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  options: Option[];
  value: any;
  onChange: (v: any) => void;
  accent?: string;
  emptyLabel?: string;
}> = ({
  title,
  desc,
  flag,
  options,
  value,
  onChange,
  accent = palette.accent,
  emptyLabel,
}) => {
  const [open, setOpen] = React.useState(false);
  const {t} = useTranslation();
  const current = options.find(o => o.value === value);
  const activeIndex = Math.max(
    0,
    options.findIndex(o => o.value === value),
  );
  return (
    <>
      <ValueRow
        title={title}
        onPress={() => setOpen(true)}
        value={
          <ValueText
            text={current?.text ?? emptyLabel ?? String(value ?? '')}
            accent={accent}
          />
        }
      />
      {open && (
        <Dialog
          title={title}
          desc={desc}
          flag={flag}
          onClose={() => setOpen(false)}
          footer={
            <DialogButton label={t('Cancel')} onPress={() => setOpen(false)} />
          }>
          <ScrollView style={styles.optionScroll}>
            {options.map((opt, idx) => (
              <OptionItem
                key={idx}
                label={opt.text}
                active={opt.value === value}
                accent={accent}
                preferFocus={idx === activeIndex}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </Dialog>
      )}
    </>
  );
};

// An on/off setting: the same dialog as any choice, with Enable / Disable.
export const SwitchRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}> = ({title, desc, flag, value, onChange, accent}) => {
  const {t} = useTranslation();
  return (
    <ChoiceRow
      title={title}
      desc={desc}
      flag={flag}
      options={[
        {value: true, text: t('Enable')},
        {value: false, text: t('Disable')},
      ]}
      value={!!value}
      onChange={onChange}
      accent={accent}
    />
  );
};

// A read-only line (title and value); holding it can do something.
export const InfoRow: React.FC<{
  title: string;
  value: string;
  accent?: string;
  onLongPress?: () => void;
}> = ({title, value, accent = palette.accent, onLongPress}) => (
  <ValueRow
    title={title}
    value={<ValueText text={value} accent={accent} />}
    onLongPress={onLongPress}
  />
);

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Rounds to the step grid anchored at `min`, and trims the float noise a
// fractional step (0.05) would otherwise pile up.
const snap = (v: number, min: number, max: number, step: number) => {
  const snapped = min + Math.round((v - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(6));
};

export const SliderRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  accent?: string;
}> = ({
  title,
  desc,
  flag,
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  accent = palette.accent,
}) => {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const {t} = useTranslation();
  const show = (v: number) => (formatValue ? formatValue(v) : String(v));
  // The coarse buttons move a tenth of the range, so a 40-step range takes a
  // handful of presses, not forty.
  const steps = Math.max(1, Math.round((max - min) / step));
  const bigStep = step * Math.max(2, Math.round(steps / 10));
  const move = (delta: number) =>
    setDraft(prev => snap(prev + delta, min, max, step));
  return (
    <>
      <ValueRow
        title={title}
        onPress={() => {
          setDraft(snap(value, min, max, step));
          setOpen(true);
        }}
        value={<ValueText text={show(value)} accent={accent} />}
      />
      {open && (
        <Dialog
          title={title}
          desc={desc}
          flag={flag}
          onClose={() => setOpen(false)}
          footer={
            <>
              <DialogButton
                label={t('Cancel')}
                onPress={() => setOpen(false)}
              />
              <DialogButton
                primary
                accent={accent}
                label={t('Confirm')}
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              />
            </>
          }>
          <View style={styles.stepper}>
            <DialogButton
              label="««"
              minWidth={64}
              onPress={() => move(-bigStep)}
              disabled={draft <= min}
            />
            <DialogButton
              preferFocus
              label="‹"
              minWidth={64}
              onPress={() => move(-step)}
              disabled={draft <= min}
            />
            <Text style={[styles.stepperValue, {color: accent}]}>
              {show(draft)}
            </Text>
            <DialogButton
              label="›"
              minWidth={64}
              onPress={() => move(step)}
              disabled={draft >= max}
            />
            <DialogButton
              label="»»"
              minWidth={64}
              onPress={() => move(bigStep)}
              disabled={draft >= max}
            />
          </View>
          <Text style={styles.stepperRange}>{`${show(min)} – ${show(
            max,
          )}`}</Text>
        </Dialog>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 16,
    // Constant 2px transparent border so gaining the focus style never
    // resizes the row (tvFocusRow sets the colour).
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
  },
  rowTitle: {flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600'},
  rowValue: {flexShrink: 0, maxWidth: '45%'},
  valueText: {fontSize: 15, fontWeight: '700'},
  divider: {marginHorizontal: 16},

  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.scrim, 0.7),
  },
  dialog: {
    width: '92%',
    maxWidth: 640,
    maxHeight: '88%',
    padding: 20,
    gap: 12,
    borderRadius: 18,
    backgroundColor: palette.elevation.l3,
    borderWidth: 1,
    borderColor: alpha(palette.text, 0.14),
  },
  dialogTitle: {fontSize: 20, fontWeight: '800'},
  dialogDescScroll: {flexGrow: 0, maxHeight: 220},
  dialogDesc: {fontSize: 13, lineHeight: 19, color: palette.textSoft},
  dialogFlag: {fontSize: 12, color: palette.warning, marginTop: 6},
  dialogBody: {flexShrink: 1, gap: 10},
  dialogFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },

  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: alpha(palette.text, 0.14),
  },
  buttonDisabled: {opacity: 0.4},
  buttonText: {fontSize: 16, fontWeight: '800', color: palette.text},
  buttonTextPrimary: {color: palette.onAccent},

  optionScroll: {flexGrow: 0},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionText: {flex: 1, fontSize: 16, fontWeight: '600'},

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stepperValue: {
    minWidth: 120,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  stepperRange: {
    textAlign: 'center',
    fontSize: 12,
    color: palette.textDim,
    fontVariant: ['tabular-nums'],
  },
});
