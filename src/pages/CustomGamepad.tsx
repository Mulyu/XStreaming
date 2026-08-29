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
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GamepadButton from '../components/CustomGamepad/Button';
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
  createDefaultMacroLayoutButton,
  ensureMacroLayoutButton,
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
    setStickMode(
      storedStick === null
        ? Number(getUserSettings().virtual_gamepad_joystick)
        : storedStick,
    );

    // console.log('_settings:', _settings);
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    setTimeout(() => {
      const {width, height} = Dimensions.get('window');

      const macroDefaultButton = createDefaultMacroLayoutButton(width, height);
      const _buttons = buildDefaultLayout(width, height);
      if (_settings[_title]) {
        const exitButtons = _settings[_title];
        const withMacro = ensureMacroLayoutButton(
          exitButtons,
          macroDefaultButton,
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
      Orientation.unlockAllOrientations();
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
                currentButton !== 'RightStick' && (
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
                  setShowModal(true);
                }}
                onDragRelease={(_, __, bounds) => {
                  handleDrag(button.name, bounds.left, bounds.top);
                  setReloader(Date.now());
                }}>
                <View style={hidden ? styles.hiddenButton : undefined}>
                  <GamepadButton
                    name={button.name}
                    width={button.width}
                    height={button.height}
                    scale={button.scale}
                  />
                </View>
              </Draggable>
            );
          }
        })}
      </>
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
