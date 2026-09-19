import React from 'react';
import Orientation from 'react-native-orientation-locker';
import {StyleSheet, NativeModules, Dimensions, View} from 'react-native';
import {
  Portal,
  Modal,
  Card,
  List,
  RadioButton,
  Text,
  Divider,
  IconButton,
  Checkbox,
  Switch,
  Button,
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GamepadButton from '../components/CustomGamepad/Button';
import KeyChip from '../components/CustomGamepad/KeyChip';
import KeyPicker from '../components/KeyPicker';
import {PickableKey} from '../utils/virtualKeys';
import GridBackground from '../components/GridBackground';
import {getSettings, saveSettings, deleteSetting} from '../store/gamepadStore';
import {
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
} from '../store/touchProfileStore';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../store/settingStore';
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
  SWIPE_AIM_NAME,
  SWIPE_AIM_MIN,
  createDefaultSwipePad,
  ensureSwipePad,
} from '../utils/gamepadLayout';

const {FullScreenManager} = NativeModules;

function CustomGamepadScreen({navigation, route}) {
  const {t} = useTranslation();
  const theme = useTheme();
  const [settings, setSettings] = React.useState({});
  const [title, setTitle] = React.useState('');
  const [buttons, setButtons] = React.useState<any>([]);
  const [showActionModal, setActionShowModal] = React.useState(false);
  const [showWarnModal, setShowWarnShowModal] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showGrid, setShowGrid] = React.useState(false);
  const [showSwipeModal, setShowSwipeModal] = React.useState(false);
  const [swipeSens, setSwipeSens] = React.useState(0);
  const [swipeInvert, setSwipeInvert] = React.useState(false);
  const [stickMode, setStickMode] = React.useState(1);
  const [reloader, setReloader] = React.useState(Date.now());

  const [currentButton, setCurrentButton] = React.useState('');
  const [currentScale, setCurrentScale] = React.useState(1);
  const [currentShow, setCurrentShow] = React.useState(true);
  const [currentTurbo, setCurrentTurbo] = React.useState(false);
  const [currentHold, setCurrentHold] = React.useState(false);

  // GFN keyboard-key buttons -- placed and configured in this same editor,
  // alongside gamepad buttons (see utils/gamepadLayout.ts's ButtonConfig.kind).
  const [showKeyPicker, setShowKeyPicker] = React.useState(false);
  // 'new': the picker is adding a fresh key button (from the action modal).
  // 'existing': it's changing currentButton's own key (from its own panel).
  const [keyPickerTarget, setKeyPickerTarget] = React.useState<
    'new' | 'existing'
  >('new');
  const currentButtonObj = buttons.find(b => b.name === currentButton);

  // Macro1/Macro2/Macro3 only -- this button's own action sequence, edited
  // right here in the layout editor instead of a shared global screen (see
  // utils/virtualMacro.ts). Mirrors currentScale/currentShow/currentTurbo:
  // seeded from the tapped button's config, written back into `buttons` on
  // every change, persisted together with everything else on Save.
  const [macroSteps, setMacroSteps] = React.useState<VirtualMacroStep[]>([]);
  const [macroLoopEnabled, setMacroLoopEnabled] = React.useState(false);
  const [macroLoopIntervalMs, setMacroLoopIntervalMs] = React.useState(500);
  const [editingMacroStep, setEditingMacroStep] = React.useState<{
    index: number;
    step: VirtualMacroStep;
  } | null>(null);

  React.useEffect(() => {
    const _settings = getSettings();
    let _title = '';
    setSettings(_settings);

    if (route.params?.name) {
      _title = route.params?.name;
      setTitle(route.params?.name);
    }

    const swipe = getSwipeConfig(_title);
    setSwipeSens(swipe.sensitivity);
    setSwipeInvert(swipe.invertY);
    const storedStick = getJoystickMode(_title);
    setStickMode(storedStick === null ? 1 : storedStick);

    // console.log('_settings:', _settings);
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    setTimeout(() => {
      const {width, height} = Dimensions.get('window');

      const macroDefaultButtons = createDefaultMacroLayoutButtons(
        width,
        height,
      );
      const _buttons = buildDefaultLayout(width, height);
      if (_settings[_title]) {
        const exitButtons = _settings[_title];
        const withMacro = ensureMacroLayoutButtons(
          exitButtons,
          macroDefaultButtons,
        );
        setButtons(
          ensureSwipePad(withMacro, createDefaultSwipePad(width, height)),
        );
      } else {
        setButtons(_buttons);
      }
      setShowWarnShowModal(true);
      setShowGrid(true);
    }, 500);

    navigation.addListener('beforeRemove', e => {
      if (e.data.action.type !== 'GO_BACK') {
        navigation.dispatch(e.data.action);
      } else {
        e.preventDefault();
        setActionShowModal(true);
      }
    });

    return () => {
      // Re-lock to portrait rather than unlocking: unlockAllOrientations()
      // forces SCREEN_ORIENTATION_SENSOR, which ignores the OS rotation
      // lock and leaves the rest of the (portrait-only) app free-rotating
      // after leaving this screen.
      Orientation.lockToPortrait();
      FullScreenManager.immersiveModeOff();
    };
  }, [navigation, route.params?.name]);

  // Button drag — snap to a coarse grid so positions land in even steps
  // instead of needing pixel-by-pixel fine-tuning.
  const handleDrag = (name, x, y) => {
    buttons.forEach(b => {
      if (b.name === name) {
        b.x = snapToGrid(x);
        b.y = snapToGrid(y);
      }
    });
    setButtons([...buttons]);
  };

  // Button size change
  const handleChangeSize = scale => {
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.scale = scale;
      }
    });
    setButtons([...buttons]);
  };

  // Resize the swipe-aim pad by dragging its bottom-right handle to (hx, hy).
  const handleResizePad = (hx, hy) => {
    buttons.forEach(b => {
      if (b.name === SWIPE_AIM_NAME) {
        b.width = Math.max(SWIPE_AIM_MIN, snapToGrid(hx) - b.x);
        b.height = Math.max(SWIPE_AIM_MIN, snapToGrid(hy) - b.y);
      }
    });
    setButtons([...buttons]);
  };

  // Button show change
  const handleChangeShow = value => {
    console.log('handleChangeShow:', value);
    setCurrentShow(value);
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.show = value;
      }
    });
    setButtons([...buttons]);
  };

  const handleChangeTurbo = value => {
    setCurrentTurbo(value);
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.turbo = value;
      }
    });
    setButtons([...buttons]);
  };

  const handleChangeHold = value => {
    setCurrentHold(value);
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.holdToggle = value;
      }
    });
    setButtons([...buttons]);
  };

  const handleKeyPicked = (picked: PickableKey) => {
    if (keyPickerTarget === 'new') {
      const {width, height} = Dimensions.get('window');
      const name = `KeyBtn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      setButtons([
        ...buttons,
        {
          name,
          kind: 'key',
          keyVk: picked.vk,
          keyLabel: picked.label,
          x: snapToGrid(width / 2 - 25),
          y: snapToGrid(height / 2 - 25),
          show: true,
          scale: 1,
        },
      ]);
    } else {
      buttons.forEach(b => {
        if (b.name === currentButton) {
          b.keyVk = picked.vk;
          b.keyLabel = picked.label;
        }
      });
      setButtons([...buttons]);
    }
    setShowKeyPicker(false);
  };

  const handleRemoveKey = () => {
    setButtons(buttons.filter(b => b.name !== currentButton));
    setShowModal(false);
  };

  // Writes the given macro fields onto currentButton's own entry in
  // `buttons`, same write-through-immediately pattern as show/turbo above.
  const writeMacroFields = (fields: Partial<VirtualMacroStep> & any) => {
    buttons.forEach(b => {
      if (b.name === currentButton) {
        Object.assign(b, fields);
      }
    });
    setButtons([...buttons]);
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

  const background = {
    borderless: false,
    color: 'rgba(255, 255, 255, 0.2)',
    foreground: true,
  };

  const handleSave = () => {
    // console.log('buttons:', buttons);
    saveSettings(title, buttons);
    setSwipeConfig(title, {sensitivity: swipeSens, invertY: swipeInvert});
    setJoystickMode(title, stickMode);
    navigation.navigate('Main', {screen: 'Settings'});
  };

  const handleReset = () => {
    const {width, height} = Dimensions.get('window');
    const _buttons = buildDefaultLayout(width, height);
    setButtons([..._buttons]);
  };

  const handleDelete = () => {
    const userSettings = getUserSettings();
    if (userSettings.custom_virtual_gamepad === title) {
      userSettings.custom_virtual_gamepad = '';
      saveUserSettings(userSettings);
    }
    deleteSetting(title);
    navigation.navigate('Main', {screen: 'Settings'});
  };

  const renderWarningModal = () => {
    return (
      <Portal>
        <Modal
          visible={showWarnModal}
          onDismiss={() => setShowWarnShowModal(false)}
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
  };

  return (
    // Full-screen (not SafeAreaView): the in-game gamepad overlay is full
    // screen, so the editor must lay out in the same coordinate space — a
    // safe-area inset here would shift every saved position by the inset.
    <View style={styles.container}>
      {renderWarningModal()}

      {showGrid && <GridBackground gridSize={20} />}

      <Portal>
        <Modal
          visible={showActionModal}
          onDismiss={() => setActionShowModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <List.Section>
                <List.Item
                  title={t('Save')}
                  background={background}
                  onPress={() => handleSave()}
                />
                <List.Item
                  title={t('Reset')}
                  background={background}
                  onPress={() => handleReset()}
                />
                <List.Item
                  title={t('Swipe aim')}
                  background={background}
                  onPress={() => {
                    setActionShowModal(false);
                    setShowSwipeModal(true);
                  }}
                />
                <List.Item
                  title={t('Add a key')}
                  background={background}
                  onPress={() => {
                    setKeyPickerTarget('new');
                    setActionShowModal(false);
                    setShowKeyPicker(true);
                  }}
                />
                {settings[title] && (
                  <List.Item
                    title={t('Delete')}
                    background={background}
                    onPress={() => handleDelete()}
                  />
                )}
                <List.Item
                  title={t('Exit')}
                  background={background}
                  onPress={() => navigation.navigate('VirtualGamepadSettings')}
                />
              </List.Section>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

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
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showModal}
          onDismiss={() => {
            setShowModal(false);
          }}
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
                      lowerLimit={0.5}
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
                onValueChange={val => handleChangeShow(val)}
                value={currentShow}>
                <RadioButton.Item label={t('Show')} value={true} />
                <RadioButton.Item label={t('Hide')} value={false} />
              </RadioButton.Group>

              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' &&
                currentButtonObj?.kind !== 'key' && (
                  <>
                    <View style={styles.title}>
                      <Text>{t('Turbo (auto-fire)')}</Text>
                      <Divider style={styles.divider} />
                    </View>
                    <RadioButton.Group
                      onValueChange={val => handleChangeTurbo(val)}
                      value={currentTurbo}>
                      <RadioButton.Item label={t('Disable')} value={false} />
                      <RadioButton.Item label={t('Enable')} value={true} />
                    </RadioButton.Group>
                  </>
                )}

              {currentButtonObj?.kind === 'key' && (
                <>
                  <List.Item
                    title={t('Change key')}
                    description={currentButtonObj.keyLabel}
                    background={background}
                    onPress={() => {
                      setKeyPickerTarget('existing');
                      setShowKeyPicker(true);
                    }}
                  />
                  <Button
                    mode="text"
                    textColor="#D32F2F"
                    onPress={handleRemoveKey}>
                    {t('Remove key')}
                  </Button>
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
                      onValueChange={val => handleChangeHold(val)}
                      value={currentHold}>
                      <RadioButton.Item label={t('Disable')} value={false} />
                      <RadioButton.Item label={t('Enable')} value={true} />
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
                    <View style={styles.macroStepsScroll}>
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
                    </View>
                  )}

                  <View style={styles.switchRow}>
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
                  onPress={() => {
                    if (!editingMacroStep) {
                      return;
                    }
                    setEditingMacroStep({
                      ...editingMacroStep,
                      step: {...editingMacroStep.step, type: 'buttons'},
                    });
                  }}>
                  {t('Button macro')}
                </Button>
                <Button
                  mode={
                    editingMacroStep?.step.type === 'stick'
                      ? 'contained'
                      : 'outlined'
                  }
                  style={styles.macroTypeButton}
                  onPress={() => {
                    if (!editingMacroStep) {
                      return;
                    }
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
                    });
                  }}>
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
                  <View style={styles.macroStepsScroll}>
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
                  </View>
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
                <Button
                  mode="outlined"
                  onPress={() => setEditingMacroStep(null)}>
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

      <>
        {/* Hidden controls stay drawn (dimmed) and tappable in the editor so a
            control set to "Hide" can be selected again and turned back on. The
            in-game overlay respects `show` and omits them. */}
        {buttons.map(button => {
          const hidden = !button.show;
          if (button.name === SWIPE_AIM_NAME) {
            const w = button.width ?? 300;
            const h = button.height ?? 260;
            return (
              <React.Fragment key={button.name + reloader}>
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
                    setReloader(Date.now());
                  }}>
                  <View
                    style={[
                      styles.pad,
                      {width: w, height: h, opacity: hidden ? 0.35 : 1},
                    ]}>
                    <Text style={styles.padLabel}>◎ {t('Swipe aim')}</Text>
                  </View>
                </Draggable>
                <Draggable
                  x={button.x + w - 14}
                  y={button.y + h - 14}
                  renderSize={28}
                  onDragRelease={(_, __, bounds) => {
                    handleResizePad(bounds.left + 14, bounds.top + 14);
                    setReloader(Date.now());
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
                key={button.name + reloader}
                renderSize={100}
                renderColor={hidden ? 'rgba(255,255,255,0.25)' : 'white'}
                isCircle
                onShortPressRelease={() => {
                  setCurrentButton(button.name);
                  setCurrentScale(1);
                  setCurrentShow(button.show ?? true);
                  setCurrentTurbo(button.turbo ?? false);
                  setShowModal(true);
                }}
                onDragRelease={(_, __, bounds) => {
                  handleDrag(button.name, bounds.left, bounds.top);
                  setReloader(Date.now());
                }}
              />
            );
          } else {
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name + reloader}
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
                  setShowModal(true);
                }}
                onDragRelease={(_, __, bounds) => {
                  handleDrag(button.name, bounds.left, bounds.top);
                  setReloader(Date.now());
                }}>
                <View style={hidden ? styles.hiddenButton : undefined}>
                  {button.kind === 'key' ? (
                    <KeyChip
                      label={button.keyLabel || '?'}
                      width={button.width}
                      height={button.height}
                      scale={button.scale}
                    />
                  ) : (
                    <GamepadButton
                      name={button.name}
                      width={button.width}
                      height={button.height}
                      scale={button.scale}
                    />
                  )}
                </View>
              </Draggable>
            );
          }
        })}
      </>

      <KeyPicker
        visible={showKeyPicker}
        onDismiss={() => setShowKeyPicker(false)}
        onSelect={handleKeyPicked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modal: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '35%',
    marginRight: '35%',
  },
  title: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  divider: {
    marginTop: 10,
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
  switchRow: {
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
  padHandle: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#2FD24B',
    borderWidth: 2,
    borderColor: '#04140a',
  },
});

export default CustomGamepadScreen;
