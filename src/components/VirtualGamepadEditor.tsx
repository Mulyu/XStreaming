import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {
  Portal,
  Modal,
  Card,
  List,
  RadioButton,
  Text,
  Divider,
  Button,
  IconButton,
  TextInput,
  Chip,
  Checkbox,
  Switch,
  useTheme,
} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GridBackground from './GridBackground';
import GamepadButton from './CustomGamepad/Button';
import CoverLayoutOverlay from './CoverLayoutOverlay';
import {getSettings as getGamepadLayouts} from '../store/gamepadStore';
import {
  createDefaultMacroLayoutButtons,
  ensureMacroLayoutButtons,
  isMacroButtonName,
  normalizeMacroLoopIntervalMs,
  normalizeMacroStep,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  VirtualMacroStep,
} from '../utils/virtualMacro';
import {
  buildDefaultLayout,
  snapToGrid,
  ButtonConfig,
  SWIPE_AIM_NAME,
  SWIPE_AIM_MIN,
  createDefaultSwipePad,
  ensureSwipePad,
} from '../utils/gamepadLayout';

export type {ButtonConfig};

export interface VirtualGamepadEditorProps {
  visible: boolean;
  profileName: string;
  // Saved custom-profile names (excluding the built-in Default).
  profiles?: string[];
  // Currently active selection: '' = built-in Default, else a profile name.
  activeProfile?: string;
  // This profile's swipe-aim config (per-profile, edited here).
  swipeSensitivity?: number;
  swipeInvertY?: boolean;
  // This profile's virtual-stick mode (0 = fixed, 1 = free).
  joystickMode?: number;
  onSave: (
    buttons: ButtonConfig[],
    swipe: {sensitivity: number; invertY: boolean},
    joystickMode: number,
  ) => void;
  onCancel: () => void;
  // Switch the live/active layout: '' selects the built-in Default.
  onSwitchProfile?: (name: string) => void;
  // copyFrom: '' = seed from the built-in Default layout, else copy that
  // existing profile's layout as the starting point.
  onCreateProfile?: (name: string, copyFrom: string) => void;
  onDeleteProfile?: (name: string) => void;
}

const buildDefaultButtons = (): ButtonConfig[] => {
  const {width, height} = Dimensions.get('window');
  return buildDefaultLayout(width, height);
};

const VirtualGamepadEditor: React.FC<VirtualGamepadEditorProps> = ({
  visible,
  profileName,
  profiles = [],
  activeProfile = '',
  swipeSensitivity = 0,
  swipeInvertY = false,
  joystickMode = 1,
  onSave,
  onCancel,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [buttons, setButtons] = React.useState<ButtonConfig[]>([]);
  const [defaultButtons, setDefaultButtons] = React.useState<ButtonConfig[]>(
    [],
  );
  const [showGrid, setShowGrid] = React.useState(true);
  const [showTips, setShowTips] = React.useState(true);
  const [currentButton, setCurrentButton] = React.useState('');
  const [currentScale, setCurrentScale] = React.useState(1);
  const [currentShow, setCurrentShow] = React.useState(true);
  const [currentTurbo, setCurrentTurbo] = React.useState(false);
  const [currentHold, setCurrentHold] = React.useState(false);
  // Macro1/2/3 only -- see CustomGamepad.tsx's own copy of this pattern.
  const [macroSteps, setMacroSteps] = React.useState<VirtualMacroStep[]>([]);
  const [macroLoopEnabled, setMacroLoopEnabled] = React.useState(false);
  const [macroLoopIntervalMs, setMacroLoopIntervalMs] = React.useState(500);
  const [editingMacroStep, setEditingMacroStep] = React.useState<{
    index: number;
    step: VirtualMacroStep;
  } | null>(null);
  const [showButtonModal, setShowButtonModal] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [copyFrom, setCopyFrom] = React.useState('');
  const [showSwipeModal, setShowSwipeModal] = React.useState(false);
  const [coverMode, setCoverMode] = React.useState(false);
  const [swipeSens, setSwipeSens] = React.useState(0);
  const [swipeInvert, setSwipeInvert] = React.useState(false);
  const [stickMode, setStickMode] = React.useState(1);
  const [reloadKey, setReloadKey] = React.useState(Date.now());

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const defaults = buildDefaultButtons();
    setDefaultButtons(defaults);
    const layouts = getGamepadLayouts();
    const layout = layouts[profileName];
    const dims = Dimensions.get('window');
    if (layout && Array.isArray(layout)) {
      const withMacro = ensureMacroLayoutButtons(
        layout,
        createDefaultMacroLayoutButtons(dims.width, dims.height),
      );
      const withPad = ensureSwipePad(
        withMacro,
        createDefaultSwipePad(dims.width, dims.height),
      );
      setButtons(withPad.map(button => ({...button})));
    } else {
      setButtons(defaults.map(button => ({...button})));
    }
    setSwipeSens(Number(swipeSensitivity) || 0);
    setSwipeInvert(!!swipeInvertY);
    setStickMode(joystickMode === 0 ? 0 : 1);
    setShowGrid(true);
    setShowTips(true);
    setReloadKey(Date.now());
  }, [visible, profileName, swipeSensitivity, swipeInvertY, joystickMode]);

  if (!visible) {
    return null;
  }

  const handleDrag = (name: string, x: number, y: number) => {
    // Snap to a coarse grid so positions land in even steps rather than needing
    // pixel-by-pixel fine-tuning.
    const next = buttons.map(button => {
      if (button.name === name) {
        return {...button, x: snapToGrid(x), y: snapToGrid(y)};
      }
      return button;
    });
    setButtons(next);
  };

  const handleChangeSize = (scale: number) => {
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, scale} : button,
    );
    setButtons(next);
  };

  // Resize the swipe-aim pad by dragging its bottom-right handle to (hx, hy).
  const handleResizePad = (hx: number, hy: number) => {
    const next = buttons.map(button => {
      if (button.name !== SWIPE_AIM_NAME) {
        return button;
      }
      return {
        ...button,
        width: Math.max(SWIPE_AIM_MIN, snapToGrid(hx) - button.x),
        height: Math.max(SWIPE_AIM_MIN, snapToGrid(hy) - button.y),
      };
    });
    setButtons(next);
  };

  const handleChangeShow = (value: boolean) => {
    setCurrentShow(value);
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, show: value} : button,
    );
    setButtons(next);
  };

  const handleChangeTurbo = (value: boolean) => {
    setCurrentTurbo(value);
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, turbo: value} : button,
    );
    setButtons(next);
  };

  const handleChangeHold = (value: boolean) => {
    setCurrentHold(value);
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, holdToggle: value} : button,
    );
    setButtons(next);
  };

  // Same write-through-immediately pattern as show/turbo above, for
  // Macro1/2/3's own action sequence (see CustomGamepad.tsx's own copy).
  const writeMacroFields = (fields: Partial<ButtonConfig> & any) => {
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, ...fields} : button,
    );
    setButtons(next);
  };

  const handleChangeMacroLoopEnabled = (value: boolean) => {
    setMacroLoopEnabled(value);
    writeMacroFields({macroLoopEnabled: value});
  };

  const handleChangeMacroLoopIntervalMs = (value: number, commit = false) => {
    const next = normalizeMacroLoopIntervalMs(value);
    setMacroLoopIntervalMs(next);
    if (commit) {
      writeMacroFields({macroLoopIntervalMs: next});
    }
  };

  const openAddMacroStep = () => {
    setEditingMacroStep({
      index: -1,
      step: {
        type: 'buttons',
        buttons: ['A'],
        stick: 'left',
        x: 0,
        y: 0,
        durationMs: 80,
        waitAfterMs: 0,
      },
    });
  };

  const openEditMacroStep = (index: number) => {
    const step = macroSteps[index];
    if (!step) {
      return;
    }
    setEditingMacroStep({index, step: {...step}});
  };

  const saveMacroStep = () => {
    if (!editingMacroStep) {
      return;
    }
    const fallbackButton = macroSteps[0]?.buttons?.[0] || 'A';
    const normalized = normalizeMacroStep(
      editingMacroStep.step,
      fallbackButton,
    );
    const next = [...macroSteps];
    if (editingMacroStep.index >= 0) {
      next[editingMacroStep.index] = normalized;
    } else {
      next.push(normalized);
    }
    setMacroSteps(next);
    writeMacroFields({macroSteps: next});
    setEditingMacroStep(null);
  };

  const deleteMacroStep = () => {
    if (!editingMacroStep || editingMacroStep.index < 0) {
      return;
    }
    const next = macroSteps.filter((_, idx) => idx !== editingMacroStep.index);
    setMacroSteps(next);
    writeMacroFields({macroSteps: next});
    setEditingMacroStep(null);
  };

  const getMacroStepTitle = (step: VirtualMacroStep, index: number) => {
    if (step.type === 'stick') {
      return `${index + 1}. ${t('Stick')}: ${t(
        step.stick === 'right' ? 'Right stick' : 'Left stick',
      )}`;
    }
    return `${index + 1}. ${step.buttons.join(' + ')}`;
  };

  const getMacroStepDescription = (step: VirtualMacroStep) => {
    if (step.type === 'stick') {
      return `X: ${step.x.toFixed(2)} · Y: ${step.y.toFixed(2)} · ${t(
        'Move',
      )}: ${step.durationMs}ms · ${t('Wait')}: ${step.waitAfterMs}ms`;
    }
    return `${t('Hold')}: ${step.durationMs}ms · ${t('Wait')}: ${
      step.waitAfterMs
    }ms`;
  };

  const handleReset = () => {
    setButtons(defaultButtons.map(button => ({...button})));
    setReloadKey(Date.now());
  };

  const handleSave = () => {
    onSave(buttons, {sensitivity: swipeSens, invertY: swipeInvert}, stickMode);
  };

  const renderSwipeModal = () => (
    <Portal>
      <Modal
        visible={showSwipeModal}
        onDismiss={() => setShowSwipeModal(false)}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Content>
            <View style={styles.title}>
              <Text>{t('virtual_joystick_title')}</Text>
              <Divider style={styles.divider} />
            </View>
            <RadioButton.Group
              onValueChange={val => setStickMode(Number(val))}
              value={String(stickMode)}>
              <RadioButton.Item label={t('Free')} value="1" />
              <RadioButton.Item label={t('Fixed')} value="0" />
            </RadioButton.Group>

            <View style={styles.title}>
              <Text>
                {t('Swipe aim sensitivity (0 = off)')}: {swipeSens}
              </Text>
              <Divider style={styles.divider} />
            </View>
            <Slider
              value={swipeSens}
              minimumValue={0}
              maximumValue={100}
              step={1}
              onValueChange={val => setSwipeSens(Math.round(val))}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor="grey"
            />
            <View style={styles.title}>
              <Text>{t('Invert swipe aim Y')}</Text>
              <Divider style={styles.divider} />
            </View>
            <RadioButton.Group
              onValueChange={val => setSwipeInvert(val === 'true')}
              value={swipeInvert ? 'true' : 'false'}>
              <RadioButton.Item label={t('Disable')} value="false" />
              <RadioButton.Item label={t('Enable')} value="true" />
            </RadioButton.Group>
            <Text style={styles.swipeHint}>{t('SwipeAimDesc')}</Text>
            <Button
              mode="text"
              onPress={() => setShowSwipeModal(false)}
              style={styles.profileAction}>
              {t('Close')}
            </Button>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );

  const renderButtonOptions = () => {
    return (
      <Portal>
        <Modal
          visible={showButtonModal}
          onDismiss={() => setShowButtonModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' && (
                  <>
                    <View style={styles.title}>
                      <Text>
                        {t('Size')}: {currentScale}
                      </Text>
                      <Divider style={styles.divider} />
                    </View>
                    <Slider
                      value={currentScale}
                      minimumValue={0.5}
                      maximumValue={4}
                      step={0.1}
                      onValueChange={val => {
                        const _val = Math.round(val * 10) / 10;
                        setCurrentScale(_val);
                        handleChangeSize(_val);
                      }}
                      minimumTrackTintColor={theme.colors.primary}
                      maximumTrackTintColor="grey"
                    />
                  </>
                )}

              <View style={styles.title}>
                <Text>{t('ShowTitle')}</Text>
                <Divider style={styles.divider} />
              </View>
              <RadioButton.Group
                onValueChange={val => handleChangeShow(val === 'true')}
                value={currentShow ? 'true' : 'false'}>
                <RadioButton.Item label={t('Show')} value="true" />
                <RadioButton.Item label={t('Hide')} value="false" />
              </RadioButton.Group>

              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' && (
                  <>
                    <View style={styles.title}>
                      <Text>{t('Turbo (auto-fire)')}</Text>
                      <Divider style={styles.divider} />
                    </View>
                    <RadioButton.Group
                      onValueChange={val => handleChangeTurbo(val === 'true')}
                      value={currentTurbo ? 'true' : 'false'}>
                      <RadioButton.Item label={t('Disable')} value="false" />
                      <RadioButton.Item label={t('Enable')} value="true" />
                    </RadioButton.Group>
                  </>
                )}

              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' &&
                currentButton !== 'Nexus' &&
                !isMacroButtonName(currentButton) && (
                  <>
                    <View style={styles.title}>
                      <Text>{t('Toggle hold')}</Text>
                      <Divider style={styles.divider} />
                    </View>
                    <RadioButton.Group
                      onValueChange={val => handleChangeHold(val === 'true')}
                      value={currentHold ? 'true' : 'false'}>
                      <RadioButton.Item label={t('Disable')} value="false" />
                      <RadioButton.Item label={t('Enable')} value="true" />
                    </RadioButton.Group>
                  </>
                )}

              {isMacroButtonName(currentButton) && (
                <>
                  <View style={styles.macroHeaderRow}>
                    <Text style={styles.macroSectionTitle}>
                      {t('Macro action sequence')}
                    </Text>
                    <IconButton
                      icon="plus-circle-outline"
                      onPress={openAddMacroStep}
                    />
                  </View>
                  <Divider />
                  {macroSteps.length === 0 ? (
                    <Text style={styles.emptyText}>
                      {t('No action steps, tap + to add')}
                    </Text>
                  ) : (
                    <ScrollView style={styles.macroStepsScroll}>
                      {macroSteps.map((step, index) => (
                        <List.Item
                          key={`macro-step-${index}`}
                          title={getMacroStepTitle(step, index)}
                          description={getMacroStepDescription(step)}
                          left={props => (
                            <List.Icon
                              {...props}
                              icon={
                                step.type === 'stick'
                                  ? 'gamepad-variant-outline'
                                  : 'gesture-tap-button'
                              }
                            />
                          )}
                          right={props => (
                            <IconButton
                              {...props}
                              icon="pencil-outline"
                              onPress={() => openEditMacroStep(index)}
                            />
                          )}
                          onPress={() => openEditMacroStep(index)}
                        />
                      ))}
                    </ScrollView>
                  )}

                  <View style={styles.macroSwitchRow}>
                    <Text>{t('Loop macro')}</Text>
                    <Switch
                      value={macroLoopEnabled}
                      onValueChange={handleChangeMacroLoopEnabled}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.title}>
                    {t('Loop interval')}: {macroLoopIntervalMs}ms
                  </Text>
                  <Slider
                    value={macroLoopIntervalMs}
                    minimumValue={0}
                    maximumValue={10000}
                    step={50}
                    onValueChange={val => handleChangeMacroLoopIntervalMs(val)}
                    onSlidingComplete={val =>
                      handleChangeMacroLoopIntervalMs(val, true)
                    }
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor="grey"
                  />
                </>
              )}
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderMacroStepModal = () => (
    <Portal>
      <Modal
        visible={!!editingMacroStep}
        onDismiss={() => setEditingMacroStep(null)}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Title
            title={
              editingMacroStep?.index !== -1
                ? t('Edit action')
                : t('Add action')
            }
          />
          <Card.Content>
            <Text style={styles.title}>{t('Action type')}</Text>
            <View style={styles.macroTypeRow}>
              <Button
                mode={
                  editingMacroStep?.step.type === 'stick'
                    ? 'outlined'
                    : 'contained'
                }
                style={styles.macroTypeButton}
                onPress={() =>
                  editingMacroStep &&
                  setEditingMacroStep({
                    ...editingMacroStep,
                    step: {...editingMacroStep.step, type: 'buttons'},
                  })
                }>
                {t('Button macro')}
              </Button>
              <Button
                mode={
                  editingMacroStep?.step.type === 'stick'
                    ? 'contained'
                    : 'outlined'
                }
                style={styles.macroTypeButton}
                onPress={() =>
                  editingMacroStep &&
                  setEditingMacroStep({
                    ...editingMacroStep,
                    step: {
                      ...editingMacroStep.step,
                      type: 'stick',
                      buttons: editingMacroStep.step.buttons?.length
                        ? editingMacroStep.step.buttons
                        : ['A'],
                      stick: editingMacroStep.step.stick || 'left',
                    },
                  })
                }>
                {t('Stick macro')}
              </Button>
            </View>

            {editingMacroStep?.step.type === 'stick' ? (
              <>
                <Text style={styles.title}>{t('Stick')}</Text>
                <View style={styles.macroTypeRow}>
                  <Button
                    mode={
                      editingMacroStep?.step.stick === 'right'
                        ? 'outlined'
                        : 'contained'
                    }
                    style={styles.macroTypeButton}
                    onPress={() =>
                      editingMacroStep &&
                      setEditingMacroStep({
                        ...editingMacroStep,
                        step: {...editingMacroStep.step, stick: 'left'},
                      })
                    }>
                    {t('Left stick')}
                  </Button>
                  <Button
                    mode={
                      editingMacroStep?.step.stick === 'right'
                        ? 'contained'
                        : 'outlined'
                    }
                    style={styles.macroTypeButton}
                    onPress={() =>
                      editingMacroStep &&
                      setEditingMacroStep({
                        ...editingMacroStep,
                        step: {...editingMacroStep.step, stick: 'right'},
                      })
                    }>
                    {t('Right stick')}
                  </Button>
                </View>

                <Text style={styles.title}>
                  X: {(editingMacroStep?.step.x ?? 0).toFixed(2)}
                </Text>
                <Slider
                  value={editingMacroStep?.step.x ?? 0}
                  minimumValue={-1}
                  maximumValue={1}
                  step={0.01}
                  onValueChange={val =>
                    editingMacroStep &&
                    setEditingMacroStep({
                      ...editingMacroStep,
                      step: {
                        ...editingMacroStep.step,
                        x: Number(val.toFixed(2)),
                      },
                    })
                  }
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor="grey"
                />

                <Text style={styles.title}>
                  Y: {(editingMacroStep?.step.y ?? 0).toFixed(2)}
                </Text>
                <Slider
                  value={editingMacroStep?.step.y ?? 0}
                  minimumValue={-1}
                  maximumValue={1}
                  step={0.01}
                  onValueChange={val =>
                    editingMacroStep &&
                    setEditingMacroStep({
                      ...editingMacroStep,
                      step: {
                        ...editingMacroStep.step,
                        y: Number(val.toFixed(2)),
                      },
                    })
                  }
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor="grey"
                />
              </>
            ) : (
              <>
                <Text style={styles.title}>{t('Buttons')}</Text>
                <Divider />
                <ScrollView style={styles.macroStepsScroll}>
                  {VIRTUAL_MACRO_ALLOWED_BUTTONS.map(button => {
                    const selected =
                      editingMacroStep?.step.buttons?.includes(button);
                    return (
                      <Checkbox.Item
                        key={button}
                        label={button}
                        status={selected ? 'checked' : 'unchecked'}
                        onPress={() => {
                          if (!editingMacroStep) {
                            return;
                          }
                          const current = Array.isArray(
                            editingMacroStep.step.buttons,
                          )
                            ? editingMacroStep.step.buttons
                            : [];
                          const next = selected
                            ? current.filter(item => item !== button)
                            : [...current, button];
                          setEditingMacroStep({
                            ...editingMacroStep,
                            step: {...editingMacroStep.step, buttons: next},
                          });
                        }}
                      />
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={styles.title}>
              {editingMacroStep?.step.type === 'stick'
                ? t('Move duration')
                : t('Hold duration')}
              : {editingMacroStep?.step.durationMs ?? 0}ms
            </Text>
            <Slider
              value={editingMacroStep?.step.durationMs ?? 80}
              minimumValue={30}
              maximumValue={5000}
              step={10}
              onValueChange={val =>
                editingMacroStep &&
                setEditingMacroStep({
                  ...editingMacroStep,
                  step: {
                    ...editingMacroStep.step,
                    durationMs: Math.round(val),
                  },
                })
              }
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor="grey"
            />

            <Text style={styles.title}>
              {t('Wait after action')}:{' '}
              {editingMacroStep?.step.waitAfterMs ?? 0}
              ms
            </Text>
            <Slider
              value={editingMacroStep?.step.waitAfterMs ?? 0}
              minimumValue={0}
              maximumValue={3000}
              step={10}
              onValueChange={val =>
                editingMacroStep &&
                setEditingMacroStep({
                  ...editingMacroStep,
                  step: {
                    ...editingMacroStep.step,
                    waitAfterMs: Math.round(val),
                  },
                })
              }
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor="grey"
            />

            <View style={styles.macroModalActions}>
              {editingMacroStep?.index !== -1 && (
                <Button
                  mode="text"
                  textColor="#D32F2F"
                  onPress={deleteMacroStep}>
                  {t('Delete')}
                </Button>
              )}
              <Button mode="outlined" onPress={() => setEditingMacroStep(null)}>
                {t('Cancel')}
              </Button>
              <Button mode="contained" onPress={saveMacroStep}>
                {t('Confirm')}
              </Button>
            </View>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );

  const renderTipsModal = () => (
    <Portal>
      <Modal
        visible={showTips}
        onDismiss={() => setShowTips(false)}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Content>
            <Text>
              TIPS1:{' '}
              {t(
                'The position of custom virtual buttons may have discrepancies with actual rendering. Please refer to the actual effect for accuracy',
              )}
            </Text>
            <Text>
              TIPS2: {t('Click on an element to set its size and display')}
            </Text>
            <Text>TIPS3: {t('Drag elements to adjust their position')}</Text>
            <Text>
              TIPS4:{' '}
              {t(
                'Hidden controls appear dimmed here; tap one to show it again',
              )}
            </Text>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );

  const canManageProfiles = Boolean(
    onSwitchProfile || onCreateProfile || onDeleteProfile,
  );

  const handleSelectProfile = (name: string) => {
    setShowProfileModal(false);
    if (name === activeProfile) {
      return;
    }
    onSwitchProfile?.(name);
  };

  const openProfileModal = () => {
    // Pre-select the currently active layout as the copy source so
    // "duplicate what I'm on" is one tap.
    setCopyFrom(activeProfile);
    setNewProfileName('');
    setShowProfileModal(true);
  };

  const handleAddProfile = () => {
    const name = newProfileName.trim();
    if (!name) {
      return;
    }
    const source = copyFrom;
    setNewProfileName('');
    setShowProfileModal(false);
    onCreateProfile?.(name, source);
  };

  const handleDeleteProfile = () => {
    setShowProfileModal(false);
    if (activeProfile) {
      onDeleteProfile?.(activeProfile);
    }
  };

  const renderProfileModal = () => (
    <Portal>
      <Modal
        visible={showProfileModal}
        onDismiss={() => setShowProfileModal(false)}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Content>
            <View style={styles.title}>
              <Text>{t('Touch controller profiles')}</Text>
              <Divider style={styles.divider} />
            </View>
            <ScrollView style={styles.profileList} nestedScrollEnabled>
              <RadioButton.Group
                onValueChange={handleSelectProfile}
                value={activeProfile}>
                <RadioButton.Item label={t('Default')} value="" />
                {profiles.map(name => (
                  <RadioButton.Item key={name} label={name} value={name} />
                ))}
              </RadioButton.Group>
            </ScrollView>

            <Divider style={styles.divider} />
            <TextInput
              dense
              mode="outlined"
              label={t('New profile name')}
              value={newProfileName}
              onChangeText={setNewProfileName}
              style={styles.profileInput}
            />
            <Text style={styles.copyFromLabel}>{t('Copy from')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.copyFromRow}>
              <Chip
                compact
                selected={copyFrom === ''}
                showSelectedCheck
                onPress={() => setCopyFrom('')}
                style={styles.copyChip}>
                {t('Default')}
              </Chip>
              {profiles.map(name => (
                <Chip
                  key={name}
                  compact
                  selected={copyFrom === name}
                  showSelectedCheck
                  onPress={() => setCopyFrom(name)}
                  style={styles.copyChip}>
                  {name}
                </Chip>
              ))}
            </ScrollView>
            <Button
              mode="contained"
              disabled={!newProfileName.trim()}
              onPress={handleAddProfile}
              style={styles.profileAction}>
              {t('Add')}
            </Button>
            {activeProfile !== '' && (
              <Button
                mode="outlined"
                onPress={handleDeleteProfile}
                textColor={theme.colors.error}
                style={styles.profileAction}>
                {t('Delete current profile')}
              </Button>
            )}
            <Button
              mode="text"
              onPress={() => setShowProfileModal(false)}
              style={styles.profileAction}>
              {t('Close')}
            </Button>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );

  // In the editor, hidden controls are still drawn — dimmed — and stay
  // draggable/tappable, so a control set to "Hide" can be selected again and
  // turned back on. (The in-game overlay respects `show` and omits them.)
  const renderButtons = () => (
    <>
      {buttons.map(button => {
        const hidden = !button.show;
        if (button.name === SWIPE_AIM_NAME) {
          const w = button.width ?? 300;
          const h = button.height ?? 260;
          return (
            <React.Fragment key={button.name + reloadKey}>
              <Draggable
                x={button.x}
                y={button.y}
                onShortPressRelease={() => {
                  setCurrentButton(button.name);
                  setCurrentShow(button.show ?? true);
                  setShowSwipeModal(true);
                }}
                onDragRelease={(_, __, bounds) => {
                  handleDrag(button.name, bounds.left, bounds.top);
                  setReloadKey(Date.now());
                }}>
                <View
                  style={[
                    styles.pad,
                    {width: w, height: h, opacity: hidden ? 0.35 : 1},
                  ]}>
                  <Text style={styles.padLabel}>◎ {t('Swipe aim')}</Text>
                </View>
              </Draggable>
              {/* Bottom-right resize handle */}
              <Draggable
                x={button.x + w - 14}
                y={button.y + h - 14}
                renderSize={28}
                onDragRelease={(_, __, bounds) => {
                  handleResizePad(bounds.left + 14, bounds.top + 14);
                  setReloadKey(Date.now());
                }}>
                <View style={styles.padHandle} />
              </Draggable>
            </React.Fragment>
          );
        }
        if (button.name === 'LeftStick' || button.name === 'RightStick') {
          return (
            <Draggable
              x={button.x}
              y={button.y}
              key={button.name + reloadKey}
              renderSize={100}
              renderColor={hidden ? 'rgba(255,255,255,0.25)' : 'white'}
              isCircle
              onShortPressRelease={() => {
                setCurrentButton(button.name);
                setCurrentScale(1);
                setCurrentShow(button.show ?? true);
                setCurrentTurbo(button.turbo ?? false);
                setShowButtonModal(true);
              }}
              onDragRelease={(_, __, bounds) => {
                handleDrag(button.name, bounds.left, bounds.top);
                setReloadKey(Date.now());
              }}
            />
          );
        }
        return (
          <Draggable
            x={button.x}
            y={button.y}
            key={button.name + reloadKey}
            onShortPressRelease={() => {
              setCurrentButton(button.name);
              setCurrentScale(button.scale || 1);
              setCurrentShow(button.show ?? true);
              setCurrentTurbo(button.turbo ?? false);
              setCurrentHold(button.holdToggle ?? false);
              if (isMacroButtonName(button.name)) {
                setMacroSteps(
                  Array.isArray(button.macroSteps) ? button.macroSteps : [],
                );
                setMacroLoopEnabled(!!button.macroLoopEnabled);
                setMacroLoopIntervalMs(
                  normalizeMacroLoopIntervalMs(button.macroLoopIntervalMs),
                );
              }
              setShowButtonModal(true);
            }}
            onDragRelease={(_, __, bounds) => {
              handleDrag(button.name, bounds.left, bounds.top);
              setReloadKey(Date.now());
            }}>
            <View style={hidden ? styles.hiddenButton : undefined}>
              <GamepadButton
                name={button.name}
                width={button.width ?? 50}
                height={button.height ?? 50}
                scale={button.scale ?? 1}
              />
            </View>
          </Draggable>
        );
      })}
    </>
  );

  if (coverMode) {
    return (
      <CoverLayoutOverlay
        profileName={activeProfile}
        onClose={() => setCoverMode(false)}
      />
    );
  }

  return (
    <Portal>
      <View style={styles.overlay}>
        {renderTipsModal()}
        {renderButtonOptions()}
        {renderMacroStepModal()}
        {canManageProfiles && renderProfileModal()}
        {renderSwipeModal()}

        {showGrid && <GridBackground gridSize={20} />}

        {/* Single centered toolbar so the controls never overlap each other
            (previously the profile switch sat on top of Cancel) and stay clear
            of the play-area buttons, which cluster at the corners/bottom. */}
        <View style={styles.toolbar} pointerEvents="box-none">
          <View style={styles.toolbarInner}>
            {canManageProfiles ? (
              <TouchableOpacity
                style={styles.profileChip}
                onPress={openProfileModal}>
                <IconButton
                  icon="controller-classic"
                  size={18}
                  style={styles.chipIcon}
                />
                <Text style={styles.chipText} numberOfLines={1}>
                  {activeProfile || t('Default')}
                </Text>
                <IconButton
                  icon="menu-down"
                  size={18}
                  style={styles.chipIcon}
                />
              </TouchableOpacity>
            ) : (
              <Text style={styles.chipText}>{profileName || t('Default')}</Text>
            )}

            <View style={styles.toolbarDivider} />

            <IconButton
              icon={showGrid ? 'grid' : 'grid-off'}
              size={20}
              onPress={() => setShowGrid(!showGrid)}
              style={styles.toolbarIcon}
            />
            <IconButton
              icon="crosshairs-gps"
              size={20}
              onPress={() => setShowSwipeModal(true)}
              style={styles.toolbarIcon}
            />
            <IconButton
              icon="monitor-cellphone"
              size={20}
              onPress={() => setCoverMode(true)}
              style={styles.toolbarIcon}
            />
            <Button
              compact
              mode="outlined"
              onPress={handleReset}
              style={styles.toolbarButton}>
              {t('Reset')}
            </Button>
            <Button
              compact
              mode="contained"
              onPress={handleSave}
              style={styles.toolbarButton}>
              {t('Save')}
            </Button>
            <Button
              compact
              mode="text"
              onPress={onCancel}
              style={styles.toolbarButton}>
              {t('Cancel')}
            </Button>
          </View>
        </View>

        {renderButtons()}
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 999,
  },
  modal: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '25%',
    marginRight: '25%',
  },
  title: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  profileList: {
    maxHeight: 260,
  },
  divider: {
    marginTop: 10,
  },
  toolbar: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 1000,
  },
  toolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '96%',
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  toolbarIcon: {
    margin: 0,
  },
  toolbarButton: {
    marginHorizontal: 3,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 160,
  },
  chipIcon: {
    margin: 0,
    marginHorizontal: -4,
  },
  chipText: {
    color: '#fff',
    flexShrink: 1,
  },
  hiddenButton: {
    opacity: 0.3,
  },
  pad: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#2FD24B',
    borderRadius: 12,
    backgroundColor: 'rgba(47,210,75,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padLabel: {
    color: '#2FD24B',
    fontWeight: '700',
    fontSize: 13,
  },
  padHandle: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#2FD24B',
    borderWidth: 2,
    borderColor: '#04140a',
  },
  swipeHint: {
    marginTop: 8,
    opacity: 0.7,
    fontSize: 12,
  },
  profileInput: {
    marginTop: 8,
  },
  copyFromLabel: {
    marginTop: 12,
    marginBottom: 4,
  },
  copyFromRow: {
    paddingVertical: 2,
  },
  copyChip: {
    marginRight: 6,
  },
  profileAction: {
    marginTop: 8,
  },
  macroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  macroSectionTitle: {
    fontWeight: '700',
  },
  emptyText: {
    opacity: 0.7,
    paddingVertical: 10,
  },
  macroStepsScroll: {
    maxHeight: 220,
  },
  macroSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  macroTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroTypeButton: {
    flex: 1,
  },
  macroModalActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export default VirtualGamepadEditor;
