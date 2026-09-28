import React from 'react';
import {StyleSheet, View} from 'react-native';
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
} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import {
  GamepadButtonPreview as GamepadButton,
  KeyChip,
} from '../../../features/controller-customization';
import {KeyPicker} from '../../../features/virtual-keyboard';
import GridBackground from '../../../shared/ui/GridBackground';
import {
  isMacroButtonName,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  SWIPE_AIM_NAME,
} from '../../../features/controller-customization';
import type {CustomGamepadViewModel} from '../model/useCustomGamepad';

type Props = CustomGamepadViewModel;

const background = {
  borderless: false,
  color: 'rgba(255, 255, 255, 0.2)',
  foreground: true,
};

const CustomGamepadView: React.FC<Props> = ({
  t,
  primaryColor,
  settings,
  title,
  buttons,
  showActionModal,
  setActionShowModal,
  showWarnModal,
  setShowWarnShowModal,
  showModal,
  setShowModal,
  showGrid,
  showSwipeModal,
  setShowSwipeModal,
  swipeSens,
  setSwipeSens,
  swipeInvert,
  setSwipeInvert,
  stickMode,
  setStickMode,
  showGyroModal,
  setShowGyroModal,
  onOpenGyroModal,
  gyroMode,
  setGyroMode,
  gyroActivation,
  setGyroActivation,
  gyroSensitivityX,
  setGyroSensitivityX,
  gyroSensitivityY,
  setGyroSensitivityY,
  gyroInvert,
  setGyroInvert,
  reloader,
  currentButton,
  currentScale,
  currentShow,
  currentTurbo,
  currentHold,
  showKeyPicker,
  setShowKeyPicker,
  setKeyPickerTarget,
  currentButtonObj,
  macroSteps,
  macroLoopEnabled,
  macroLoopIntervalMs,
  editingMacroStep,
  setEditingMacroStep,
  handleChangeSize,
  handleChangeShow,
  handleChangeTurbo,
  handleChangeHold,
  handleKeyPicked,
  handleRemoveKey,
  handleChangeMacroLoopEnabled,
  handleChangeMacroLoopIntervalMs,
  openAddMacroStep,
  openEditMacroStep,
  saveMacroStep,
  deleteMacroStep,
  getMacroStepTitle,
  getMacroStepDescription,
  handleSave,
  handleReset,
  handleDelete,
  onExit,
  onSelectSwipePad,
  onSelectStick,
  onSelectButton,
  onDragReleaseWithReload,
  onResizePadWithReload,
}) => {
  return (
    // Full-screen (not SafeAreaView): the in-game gamepad overlay is full
    // screen, so the editor must lay out in the same coordinate space — a
    // safe-area inset here would shift every saved position by the inset.
    <View style={styles.container}>
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
                  title={t('Gyro aim')}
                  background={background}
                  onPress={onOpenGyroModal}
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
                  onPress={onExit}
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
                minimumTrackTintColor={primaryColor}
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
          visible={showGyroModal}
          onDismiss={() => setShowGyroModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <View style={styles.title}>
                <Text>{t('Gyro aim source')}</Text>
                <Divider style={styles.divider} />
              </View>
              <RadioButton.Group
                onValueChange={val => setGyroMode(Number(val))}
                value={String(gyroMode)}>
                <RadioButton.Item label={t('Off')} value="0" />
                <RadioButton.Item label={t('This device')} value="1" />
                <RadioButton.Item label={t('Controller')} value="2" />
              </RadioButton.Group>

              {gyroMode !== 0 && (
                <>
                  <View style={styles.title}>
                    <Text>{t('Gyro aim activation')}</Text>
                    <Divider style={styles.divider} />
                  </View>
                  <RadioButton.Group
                    onValueChange={val => setGyroActivation(Number(val))}
                    value={String(gyroActivation)}>
                    <RadioButton.Item
                      label={t('While left trigger held')}
                      value="1"
                    />
                    <RadioButton.Item
                      label={t('While left bumper held')}
                      value="2"
                    />
                    <RadioButton.Item
                      label={t('While either held')}
                      value="3"
                    />
                    <RadioButton.Item label={t('Always')} value="4" />
                  </RadioButton.Group>

                  <View style={styles.title}>
                    <Text>
                      {t('Gyro aim sensitivity X')}: {gyroSensitivityX}
                    </Text>
                    <Divider style={styles.divider} />
                  </View>
                  <Slider
                    value={gyroSensitivityX}
                    minimumValue={1000}
                    maximumValue={40000}
                    step={500}
                    onValueChange={val => setGyroSensitivityX(Math.round(val))}
                    minimumTrackTintColor={primaryColor}
                    maximumTrackTintColor="grey"
                  />

                  <View style={styles.title}>
                    <Text>
                      {t('Gyro aim sensitivity Y')}: {gyroSensitivityY}
                    </Text>
                    <Divider style={styles.divider} />
                  </View>
                  <Slider
                    value={gyroSensitivityY}
                    minimumValue={1000}
                    maximumValue={40000}
                    step={500}
                    onValueChange={val => setGyroSensitivityY(Math.round(val))}
                    minimumTrackTintColor={primaryColor}
                    maximumTrackTintColor="grey"
                  />

                  <View style={styles.title}>
                    <Text>{t('Invert gyro aim')}</Text>
                    <Divider style={styles.divider} />
                  </View>
                  <RadioButton.Group
                    onValueChange={val => setGyroInvert(Number(val))}
                    value={String(gyroInvert)}>
                    <RadioButton.Item label={t('None')} value="0" />
                    <RadioButton.Item label={t('Invert X')} value="1" />
                    <RadioButton.Item label={t('Invert Y')} value="2" />
                    <RadioButton.Item label={t('Invert both')} value="3" />
                    <RadioButton.Item label={t('Swap X/Y')} value="4" />
                  </RadioButton.Group>
                </>
              )}
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
                        handleChangeSize(_val);
                      }}
                      lowerLimit={0.5}
                      minimumTrackTintColor={primaryColor}
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
                      color={primaryColor}
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
                    minimumTrackTintColor={primaryColor}
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
                    minimumTrackTintColor={primaryColor}
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
                    minimumTrackTintColor={primaryColor}
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
                minimumTrackTintColor={primaryColor}
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
                minimumTrackTintColor={primaryColor}
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
                  onShortPressRelease={() =>
                    onSelectSwipePad(button.name, button.show)
                  }
                  onDragRelease={(_, __, bounds) =>
                    onDragReleaseWithReload(button.name, bounds)
                  }>
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
                  onDragRelease={(_, __, bounds) =>
                    onResizePadWithReload(bounds.left + 14, bounds.top + 14)
                  }>
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
                onShortPressRelease={() =>
                  onSelectStick(button.name, button.show, button.turbo)
                }
                onDragRelease={(_, __, bounds) =>
                  onDragReleaseWithReload(button.name, bounds)
                }
              />
            );
          } else {
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name + reloader}
                onShortPressRelease={() => onSelectButton(button)}
                onDragRelease={(_, __, bounds) =>
                  onDragReleaseWithReload(button.name, bounds)
                }>
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
};

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

export default CustomGamepadView;
