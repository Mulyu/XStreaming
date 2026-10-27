import React from 'react';
import {StyleSheet, View, ScrollView, Pressable} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';
import {alpha, palette} from '../../../shared/config/palette';
import type {
  InputMappingViewModel,
  MappingTab,
} from '../model/useInputMappingScreen';

type Props = InputMappingViewModel;

// One focus hook per control that appears once; the repeated ones (list rows,
// chips) share one focused-key state instead.
function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[
        styles.tab,
        active && styles.tabActive,
        focus.focused && tvFocusRing,
      ]}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole="button"
      accessibilityState={{selected: active}}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
  trailingIcon,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  trailingIcon?: string;
}) {
  const focus = useTVFocus();
  return (
    <Pressable
      style={[
        styles.action,
        primary && styles.actionPrimary,
        focus.focused && tvFocusRing,
      ]}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole="button">
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
      {trailingIcon && (
        <Icon
          source={trailingIcon}
          size={16}
          color={primary ? palette.onAccent : palette.text}
        />
      )}
    </Pressable>
  );
}

const InputMappingView: React.FC<Props> = ({
  t,
  tab,
  onChangeTab,
  rows,
  editing,
  editingLabel,
  editingAllowsMouse,
  editingKeys,
  mouseOptions,
  capturing,
  onOpenTarget,
  onCloseDialog,
  onStartCapture,
  onCancelCapture,
  onRemoveKey,
  onToggleMouse,
  lookUp,
  onToggleReverseY,
  onReset,
  onOpenGamepadMap,
  onOpenVirtualGamepad,
}) => {
  const [focusedKey, setFocusedKey] = React.useState<string | null>(null);
  const clearFocus = (key: string) =>
    setFocusedKey(prev => (prev === key ? null : prev));

  const tabs: {value: MappingTab; label: string}[] = [
    {value: 'gamepad', label: t('InputMappingTabGamepad')},
    {value: 'kbm', label: t('InputMappingTabKbm')},
    {value: 'virtual', label: t('InputMappingTabVirtual')},
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {tabs.map(item => (
          <TabButton
            key={item.value}
            label={item.label}
            active={tab === item.value}
            onPress={() => onChangeTab(item.value)}
          />
        ))}
      </View>

      {tab === 'gamepad' && (
        <View style={styles.pane}>
          <Text style={styles.note}>{t('InputMappingGamepadNote')}</Text>
          <ActionButton
            primary
            label={t('InputMappingOpenGamepad')}
            onPress={onOpenGamepadMap}
            trailingIcon="chevron-right"
          />
        </View>
      )}

      {tab === 'virtual' && (
        <View style={styles.pane}>
          <Text style={styles.note}>{t('InputMappingVirtualNote')}</Text>
          <ActionButton
            primary
            label={t('InputMappingOpenVirtual')}
            onPress={onOpenVirtualGamepad}
            trailingIcon="chevron-right"
          />
        </View>
      )}

      {tab === 'kbm' && (
        <>
          <ScrollView style={styles.list}>
            <Text style={[styles.note, styles.noteInList]}>
              {t('InputMappingKbmNote')}
            </Text>
            {rows.map(row => (
              <Pressable
                key={row.target}
                style={[styles.row, focusedKey === row.target && tvFocusRing]}
                onPress={() => onOpenTarget(row.target)}
                onFocus={() => setFocusedKey(row.target)}
                onBlur={() => clearFocus(row.target)}
                accessibilityRole="button">
                <Text style={styles.rowLabel}>{row.label}</Text>
                <View style={styles.chips}>
                  {row.chips.length === 0 ? (
                    <Text style={styles.unbound}>
                      {t('InputMappingUnbound')}
                    </Text>
                  ) : (
                    row.chips.map(chip => (
                      <View key={chip} style={styles.keycap}>
                        <Text style={styles.keycapText}>{chip}</Text>
                      </View>
                    ))
                  )}
                </View>
                <Icon
                  source="chevron-right"
                  size={18}
                  color={palette.textSoft}
                />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Text style={styles.footerLabel}>{t('InputMappingMouseLook')}</Text>
            <ActionButton
              label={t(
                lookUp.xbox
                  ? 'InputMappingMouseLookXboxUp'
                  : 'InputMappingMouseLookXboxDown',
              )}
              onPress={() => onToggleReverseY('xbox')}
            />
            <ActionButton
              label={t(
                lookUp.ps
                  ? 'InputMappingMouseLookPsUp'
                  : 'InputMappingMouseLookPsDown',
              )}
              onPress={() => onToggleReverseY('ps')}
            />
            <ActionButton label={t('InputMappingReset')} onPress={onReset} />
          </View>
        </>
      )}

      {editing !== null && (
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{editingLabel}</Text>

            <Text style={styles.dialogSection}>{t('InputMappingKeys')}</Text>
            <View style={styles.chips}>
              {editingKeys.length === 0 && (
                <Text style={styles.unbound}>{t('InputMappingUnbound')}</Text>
              )}
              {editingKeys.map(key => (
                <Pressable
                  key={key.code}
                  style={[
                    styles.keycap,
                    styles.keycapRemovable,
                    focusedKey === `k${key.code}` && tvFocusRing,
                  ]}
                  onPress={() => onRemoveKey(key.code)}
                  onFocus={() => setFocusedKey(`k${key.code}`)}
                  onBlur={() => clearFocus(`k${key.code}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${key.label} ${t(
                    'InputMappingRemove',
                  )}`}>
                  <Text style={styles.keycapText}>{key.label}</Text>
                  <Icon source="close" size={14} color={palette.textSoft} />
                </Pressable>
              ))}
            </View>
            {capturing ? (
              <View style={styles.capture}>
                <Text style={styles.captureText}>
                  {t('InputMappingPressKey')}
                </Text>
                <ActionButton label={t('Cancel')} onPress={onCancelCapture} />
              </View>
            ) : (
              <ActionButton
                label={t('InputMappingAddKey')}
                onPress={onStartCapture}
              />
            )}

            {editingAllowsMouse && (
              <>
                <Text style={styles.dialogSection}>
                  {t('InputMappingMouse')}
                </Text>
                <View style={styles.chips}>
                  {mouseOptions.map(option => (
                    <Pressable
                      key={option.button}
                      style={[
                        styles.mouseChip,
                        option.bound && styles.mouseChipOn,
                        focusedKey === `m${option.button}` && tvFocusRing,
                      ]}
                      onPress={() => onToggleMouse(option.button)}
                      onFocus={() => setFocusedKey(`m${option.button}`)}
                      onBlur={() => clearFocus(`m${option.button}`)}
                      accessibilityRole="button"
                      accessibilityState={{selected: option.bound}}>
                      <Text
                        style={[
                          styles.mouseChipText,
                          option.bound && styles.mouseChipTextOn,
                          option.boundElsewhere && styles.mouseChipElsewhere,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.dialogFooter}>
              <ActionButton
                primary
                label={t('Close')}
                onPress={onCloseDialog}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1},
  tabs: {
    flexDirection: 'row',
    gap: 6,
    margin: 16,
    marginBottom: 8,
    padding: 3,
    borderRadius: 14,
    backgroundColor: alpha(palette.text, 0.14),
  },
  // Constant 2px transparent border so gaining the focus ring never resizes
  // the button.
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {backgroundColor: palette.accent},
  tabText: {fontSize: 12.5, fontWeight: '700', color: palette.textSoft},
  tabTextActive: {color: palette.onAccent},
  pane: {paddingHorizontal: 16, gap: 16},
  note: {fontSize: 12, lineHeight: 20, color: palette.textSoft},
  noteInList: {paddingHorizontal: 16, paddingBottom: 6},
  list: {flex: 1},
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginHorizontal: 2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowLabel: {width: 118, fontSize: 14, fontWeight: '700'},
  chips: {flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5},
  unbound: {fontSize: 12.5, color: palette.textDim},
  keycap: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: palette.surfaceHigh,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  keycapRemovable: {height: 32, paddingHorizontal: 9},
  keycapText: {fontSize: 12, fontWeight: '800', color: palette.text},
  footerLabel: {fontSize: 11.5, fontWeight: '700', color: palette.textSoft},
  footer: {
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: alpha(palette.text, 0.14),
  },
  // An overlay inside the screen rather than a Modal: a Modal is its own
  // window, and key capture reads the activity's key events.
  scrim: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: alpha(palette.black, 0.6),
  },
  dialog: {
    padding: 18,
    gap: 12,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
  },
  dialogTitle: {fontSize: 17, fontWeight: '800'},
  dialogSection: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: palette.textSoft,
    marginTop: 4,
  },
  capture: {gap: 10},
  captureText: {fontSize: 13, fontWeight: '700', color: palette.warning},
  mouseChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: alpha(palette.text, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  mouseChipOn: {backgroundColor: palette.accent},
  mouseChipText: {fontSize: 12.5, fontWeight: '700', color: palette.textSoft},
  mouseChipTextOn: {color: palette.onAccent},
  mouseChipElsewhere: {fontStyle: 'italic'},
  dialogFooter: {marginTop: 6},
  action: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: alpha(palette.text, 0.14),
  },
  actionPrimary: {backgroundColor: palette.accent},
  actionText: {fontSize: 14, fontWeight: '800', color: palette.text},
  actionTextPrimary: {color: palette.onAccent},
});

export default InputMappingView;
