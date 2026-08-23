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
  RadioButton,
  Text,
  Divider,
  Button,
  IconButton,
  TextInput,
  Chip,
  useTheme,
} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GridBackground from './GridBackground';
import GamepadButton from './CustomGamepad/Button';
import {getSettings as getGamepadLayouts} from '../store/gamepadStore';
import {
  createDefaultMacroLayoutButton,
  ensureMacroLayoutButton,
} from '../utils/virtualMacro';
import {
  buildDefaultLayout,
  snapToGrid,
  ButtonConfig,
} from '../utils/gamepadLayout';

export type {ButtonConfig};

export interface VirtualGamepadEditorProps {
  visible: boolean;
  profileName: string;
  // Saved custom-profile names (excluding the built-in Default).
  profiles?: string[];
  // Currently active selection: '' = built-in Default, else a profile name.
  activeProfile?: string;
  onSave: (buttons: ButtonConfig[]) => void;
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
  const [showButtonModal, setShowButtonModal] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [copyFrom, setCopyFrom] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(Date.now());

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const defaults = buildDefaultButtons();
    setDefaultButtons(defaults);
    const layouts = getGamepadLayouts();
    const layout = layouts[profileName];
    if (layout && Array.isArray(layout)) {
      const withMacro = ensureMacroLayoutButton(
        layout,
        createDefaultMacroLayoutButton(
          Dimensions.get('window').width,
          Dimensions.get('window').height,
        ),
      );
      setButtons(withMacro.map(button => ({...button})));
    } else {
      setButtons(defaults.map(button => ({...button})));
    }
    setShowGrid(true);
    setShowTips(true);
    setReloadKey(Date.now());
  }, [visible, profileName]);

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

  const handleChangeShow = (value: boolean) => {
    setCurrentShow(value);
    const next = buttons.map(button =>
      button.name === currentButton ? {...button, show: value} : button,
    );
    setButtons(next);
  };

  const handleReset = () => {
    setButtons(defaultButtons.map(button => ({...button})));
    setReloadKey(Date.now());
  };

  const handleSave = () => {
    onSave(buttons);
  };

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
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

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
            <RadioButton.Group
              onValueChange={handleSelectProfile}
              value={activeProfile}>
              <RadioButton.Item label={t('Default')} value="" />
              {profiles.map(name => (
                <RadioButton.Item key={name} label={name} value={name} />
              ))}
            </RadioButton.Group>

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

  const renderButtons = () => (
    <>
      {buttons.map(button => {
        if (button.name === 'LeftStick' || button.name === 'RightStick') {
          if (!button.show) {
            return null;
          }
          return (
            <Draggable
              x={button.x}
              y={button.y}
              key={button.name + reloadKey}
              renderSize={100}
              renderColor="white"
              isCircle
              onShortPressRelease={() => {
                setCurrentButton(button.name);
                setCurrentScale(1);
                setCurrentShow(button.show ?? true);
                setShowButtonModal(true);
              }}
              onDragRelease={(_, __, bounds) => {
                handleDrag(button.name, bounds.left, bounds.top);
                setReloadKey(Date.now());
              }}
            />
          );
        }
        if (!button.show) {
          return null;
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
              setShowButtonModal(true);
            }}
            onDragRelease={(_, __, bounds) => {
              handleDrag(button.name, bounds.left, bounds.top);
              setReloadKey(Date.now());
            }}>
            <GamepadButton
              name={button.name}
              width={button.width ?? 50}
              height={button.height ?? 50}
              scale={button.scale ?? 1}
            />
          </Draggable>
        );
      })}
    </>
  );

  return (
    <Portal>
      <View style={styles.overlay}>
        {renderTipsModal()}
        {renderButtonOptions()}
        {canManageProfiles && renderProfileModal()}

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
});

export default VirtualGamepadEditor;
