import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {Text, Icon, Switch, Divider} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {useTVFocus, tvFocusBold, tvFocusRow} from './tvFocus';
import {alpha, palette} from '../config/palette';

// Settings rows for TV. A remote has no good way to change a value in place
// (tiny chips, a dropdown anchored to a pill, a slider track), so on TV every
// row is one line -- title, description, current value -- and pressing it
// opens a dialog that picks the value. A switch just toggles on press.
// InlineSettingRows swaps these in for the phone layout when Platform.isTV.

type Option = {value: any; text: string};

type ValueRowProps = {
  title: string;
  desc?: string;
  flag?: string;
  // Shown on the right; a node for things like a colour dot or a switch.
  value: React.ReactNode;
  onPress: () => void;
};

const TvValueRow: React.FC<ValueRowProps> = ({
  title,
  desc,
  flag,
  value,
  onPress,
}) => {
  const focus = useTVFocus();
  return (
    <>
      <Pressable
        style={[styles.row, focus.focused && tvFocusRow]}
        onPress={onPress}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        accessibilityRole="button">
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!desc && (
            <Text style={styles.rowDesc} numberOfLines={3}>
              {desc}
            </Text>
          )}
          {!!flag && <Text style={styles.rowFlag}>{flag}</Text>}
        </View>
        <View style={styles.rowValue}>{value}</View>
        <Icon source="chevron-right" size={20} color={palette.textSoft} />
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

const TvDialog: React.FC<{
  title: string;
  desc?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({title, desc, onClose, children, footer}) => (
  <Modal transparent animationType="fade" visible onRequestClose={onClose}>
    <View style={styles.scrim}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{title}</Text>
        {!!desc && <Text style={styles.dialogDesc}>{desc}</Text>}
        <View style={styles.dialogBody}>{children}</View>
        {!!footer && <View style={styles.dialogFooter}>{footer}</View>}
      </View>
    </View>
  </Modal>
);

const TvButton: React.FC<{
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

const SwatchItem: React.FC<{
  color: string;
  active: boolean;
  preferFocus: boolean;
  onPress: () => void;
}> = ({color, active, preferFocus, onPress}) => {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[
        styles.swatch,
        {backgroundColor: color},
        active && styles.swatchActive,
        focus.focused && tvFocusBold,
      ]}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hasTVPreferredFocus={preferFocus}
      accessibilityRole="button"
    />
  );
};

// ---- rows ----

export const TvSwitchRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  accent: string;
}> = ({title, desc, flag, value, onChange, accent}) => (
  <TvValueRow
    title={title}
    desc={desc}
    flag={flag}
    onPress={() => onChange(!value)}
    value={
      // Only shows the state; the row itself is the button.
      <View pointerEvents="none">
        <Switch value={!!value} color={accent} />
      </View>
    }
  />
);

export const TvChoiceRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  options: Option[];
  value: any;
  onChange: (v: any) => void;
  accent: string;
  emptyLabel?: string;
}> = ({title, desc, flag, options, value, onChange, accent, emptyLabel}) => {
  const [open, setOpen] = React.useState(false);
  const {t} = useTranslation();
  const current = options.find(o => o.value === value);
  const activeIndex = Math.max(
    0,
    options.findIndex(o => o.value === value),
  );
  return (
    <>
      <TvValueRow
        title={title}
        desc={desc}
        flag={flag}
        onPress={() => setOpen(true)}
        value={
          <ValueText
            text={current?.text ?? emptyLabel ?? String(value ?? '')}
            accent={accent}
          />
        }
      />
      {open && (
        <TvDialog
          title={title}
          desc={desc}
          onClose={() => setOpen(false)}
          footer={
            <TvButton label={t('Cancel')} onPress={() => setOpen(false)} />
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
        </TvDialog>
      )}
    </>
  );
};

export const TvTextRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  suggestions?: Option[];
  accent: string;
}> = ({
  title,
  desc,
  flag,
  value,
  placeholder,
  onChange,
  suggestions,
  accent,
}) => {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const {t} = useTranslation();
  const openDialog = () => {
    setDraft(value);
    setOpen(true);
  };
  const commit = (next: string) => {
    onChange(next.trim());
    setOpen(false);
  };
  return (
    <>
      <TvValueRow
        title={title}
        desc={desc}
        flag={flag}
        onPress={openDialog}
        value={<ValueText text={value || placeholder || '-'} accent={accent} />}
      />
      {open && (
        <TvDialog
          title={title}
          desc={desc}
          onClose={() => setOpen(false)}
          footer={
            <>
              <TvButton label={t('Cancel')} onPress={() => setOpen(false)} />
              <TvButton
                primary
                accent={accent}
                label={t('Confirm')}
                onPress={() => commit(draft)}
              />
            </>
          }>
          <TextInput
            style={styles.textInput}
            value={draft}
            placeholder={placeholder}
            placeholderTextColor={alpha(palette.text, 0.5)}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onChangeText={setDraft}
            onSubmitEditing={() => commit(draft)}
          />
          {!!suggestions?.length && (
            <ScrollView style={styles.suggestionScroll}>
              {suggestions.map((s, idx) => (
                <OptionItem
                  key={idx}
                  label={s.text}
                  active={s.value === value}
                  accent={accent}
                  preferFocus={false}
                  onPress={() => commit(s.value)}
                />
              ))}
            </ScrollView>
          )}
        </TvDialog>
      )}
    </>
  );
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Rounds to the step grid anchored at `min`, and trims the float noise a
// fractional step (0.05) would otherwise pile up.
const snap = (v: number, min: number, max: number, step: number) => {
  const snapped = min + Math.round((v - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(6));
};

export const TvStepperRow: React.FC<{
  title: string;
  desc?: string;
  flag?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  accent: string;
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
  accent,
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
      <TvValueRow
        title={title}
        desc={desc}
        flag={flag}
        onPress={() => {
          setDraft(snap(value, min, max, step));
          setOpen(true);
        }}
        value={<ValueText text={show(value)} accent={accent} />}
      />
      {open && (
        <TvDialog
          title={title}
          desc={desc}
          onClose={() => setOpen(false)}
          footer={
            <>
              <TvButton label={t('Cancel')} onPress={() => setOpen(false)} />
              <TvButton
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
            <TvButton
              label="««"
              minWidth={64}
              onPress={() => move(-bigStep)}
              disabled={draft <= min}
            />
            <TvButton
              preferFocus
              label="‹"
              minWidth={64}
              onPress={() => move(-step)}
              disabled={draft <= min}
            />
            <Text style={[styles.stepperValue, {color: accent}]}>
              {show(draft)}
            </Text>
            <TvButton
              label="›"
              minWidth={64}
              onPress={() => move(step)}
              disabled={draft >= max}
            />
            <TvButton
              label="»»"
              minWidth={64}
              onPress={() => move(bigStep)}
              disabled={draft >= max}
            />
          </View>
          <Text style={styles.stepperRange}>{`${show(min)} – ${show(
            max,
          )}`}</Text>
        </TvDialog>
      )}
    </>
  );
};

export const TvSwatchRow: React.FC<{
  title: string;
  desc?: string;
  colors: string[];
  value: string;
  onChange: (v: string) => void;
}> = ({title, desc, colors, value, onChange}) => {
  const [open, setOpen] = React.useState(false);
  const {t} = useTranslation();
  const activeIndex = Math.max(0, colors.indexOf(value));
  return (
    <>
      <TvValueRow
        title={title}
        desc={desc}
        onPress={() => setOpen(true)}
        value={<View style={[styles.swatchDot, {backgroundColor: value}]} />}
      />
      {open && (
        <TvDialog
          title={title}
          desc={desc}
          onClose={() => setOpen(false)}
          footer={
            <TvButton label={t('Cancel')} onPress={() => setOpen(false)} />
          }>
          <View style={styles.swatchGrid}>
            {colors.map((c, idx) => (
              <SwatchItem
                key={c}
                color={c}
                active={c === value}
                preferFocus={idx === activeIndex}
                onPress={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </View>
        </TvDialog>
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
  rowText: {flex: 1, minWidth: 0, gap: 3},
  rowTitle: {fontSize: 17, fontWeight: '600'},
  rowDesc: {fontSize: 13, color: palette.textSoft},
  rowFlag: {fontSize: 12, color: palette.warning},
  rowValue: {flexShrink: 0, maxWidth: 280},
  valueText: {fontSize: 15, fontWeight: '700'},
  divider: {marginHorizontal: 16},

  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(palette.scrim, 0.7),
  },
  dialog: {
    width: '70%',
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
  dialogDesc: {fontSize: 13, color: palette.textSoft},
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
  suggestionScroll: {maxHeight: 200},
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

  textInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: alpha(palette.text, 0.24),
    backgroundColor: alpha(palette.text, 0.08),
    fontSize: 17,
    color: palette.text,
  },

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

  swatchDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(palette.black, 0.25),
  },
  swatchGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 14},
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: alpha(palette.black, 0.25),
  },
  swatchActive: {borderColor: palette.white},
});
