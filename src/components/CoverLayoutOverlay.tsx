import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  NativeModules,
  useWindowDimensions,
} from 'react-native';
import {
  Portal,
  Modal,
  Card,
  Button,
  Divider,
  RadioButton,
  Switch,
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GridBackground from './GridBackground';
import {coverGamepadBus} from '../utils/coverGamepadBus';
import {snapToGrid} from '../utils/gamepadLayout';
import {getCoverEnabled, setCoverEnabled} from '../store/touchProfileStore';
import {
  getCoverLayout,
  saveCoverLayout,
  defaultCoverLayout,
  CoverButton,
} from '../store/coverLayoutStore';

const {CoverDisplayManager} = NativeModules;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export interface CoverLayoutOverlayProps {
  profileName: string;
  onClose: () => void;
}

// In-editor overlay for arranging the cover-screen buttons of a profile. The
// inner screen stands in for the cover; the live cover (already presented while
// streaming) previews the layout as you drag. It only edits + persists the
// layout — it does not manage the cover session (the stream screen does that).
const CoverLayoutOverlay: React.FC<CoverLayoutOverlayProps> = ({
  profileName,
  onClose,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const {width: W, height: H} = useWindowDimensions();
  const [buttons, setButtons] = React.useState<CoverButton[]>([]);
  const [current, setCurrent] = React.useState('');
  const [currentSize, setCurrentSize] = React.useState(0.18);
  const [currentShow, setCurrentShow] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const initial = getCoverLayout(profileName);
    setButtons(initial);
    setEnabled(getCoverEnabled(profileName));
    coverGamepadBus.setLayout(initial);
    // Present the cover while editing so changes preview live, regardless of
    // whether the profile has it enabled at runtime. On close the stream
    // screen restores the enabled-based state.
    CoverDisplayManager?.present?.('XCoverScreen')?.catch?.(() => {});
    return () => {
      CoverDisplayManager?.dismiss?.();
    };
  }, [profileName]);

  const toggleEnabled = (value: boolean) => {
    setEnabled(value);
    setCoverEnabled(profileName, value);
  };

  const apply = (next: CoverButton[]) => {
    setButtons(next);
    coverGamepadBus.setLayout(next);
  };

  const handleDrag = (name: string, px: number, py: number) => {
    // Snap to the same coarse grid as the inner editor so buttons land in even
    // steps instead of needing pixel-by-pixel fine-tuning.
    const sx = snapToGrid(px);
    const sy = snapToGrid(py);
    apply(
      buttons.map(b => {
        if (b.name !== name) {
          return b;
        }
        const maxX = 1 - b.size;
        const maxY = 1 - (b.size * W) / H;
        return {
          ...b,
          x: clamp(sx / W, 0, Math.max(0, maxX)),
          y: clamp(sy / H, 0, Math.max(0, maxY)),
        };
      }),
    );
  };

  const handleSize = (size: number) => {
    setCurrentSize(size);
    apply(buttons.map(b => (b.name === current ? {...b, size} : b)));
  };

  const handleShow = (show: boolean) => {
    setCurrentShow(show);
    apply(buttons.map(b => (b.name === current ? {...b, show} : b)));
  };

  const handleReset = () => {
    apply(defaultCoverLayout());
    setReloadKey(k => k + 1);
  };

  const handleSave = () => {
    saveCoverLayout(profileName, buttons);
    coverGamepadBus.setLayout(buttons);
    onClose();
  };

  const handleBack = () => {
    // Discard unsaved edits: restore the persisted layout on the cover.
    coverGamepadBus.setLayout(getCoverLayout(profileName));
    onClose();
  };

  return (
    <Portal>
      <View style={styles.container}>
        <GridBackground gridSize={20} />

        <View style={styles.toolbar}>
          <View style={styles.enableRow}>
            <Switch value={enabled} onValueChange={toggleEnabled} />
            <Text style={styles.enableLabel}>{t('Enable cover controls')}</Text>
          </View>
          <View style={styles.toolbarBtns}>
            <Button
              compact
              mode="outlined"
              onPress={handleReset}
              style={styles.tbtn}>
              {t('Reset')}
            </Button>
            <Button
              compact
              mode="contained"
              onPress={handleSave}
              style={styles.tbtn}>
              {t('Save')}
            </Button>
            <Button
              compact
              mode="text"
              onPress={handleBack}
              style={styles.tbtn}>
              {t('Back')}
            </Button>
          </View>
        </View>

        {buttons.map(b => {
          const side = b.size * W;
          return (
            <Draggable
              x={b.x * W}
              y={b.y * H}
              key={b.name + reloadKey}
              onShortPressRelease={() => {
                setCurrent(b.name);
                setCurrentSize(b.size);
                setCurrentShow(b.show);
                setShowModal(true);
              }}
              onDragRelease={(_, __, bounds) => {
                handleDrag(b.name, bounds.left, bounds.top);
                setReloadKey(k => k + 1);
              }}>
              <View
                style={[
                  styles.padButton,
                  {width: side, height: side, opacity: b.show ? 1 : 0.35},
                ]}>
                <Text style={styles.padLabel}>{b.label}</Text>
              </View>
            </Draggable>
          );
        })}

        <Portal>
          <Modal
            visible={showModal}
            onDismiss={() => setShowModal(false)}
            contentContainerStyle={styles.modal}>
            <Card>
              <Card.Content>
                <View style={styles.title}>
                  <Text style={styles.modalText}>
                    {t('Size')}: {currentSize.toFixed(2)}
                  </Text>
                  <Divider style={styles.divider} />
                </View>
                <Slider
                  value={currentSize}
                  minimumValue={0.08}
                  maximumValue={0.35}
                  step={0.01}
                  onValueChange={val => handleSize(Math.round(val * 100) / 100)}
                  minimumTrackTintColor={theme.colors.primary}
                  maximumTrackTintColor="grey"
                />
                <View style={styles.title}>
                  <Text style={styles.modalText}>{t('ShowTitle')}</Text>
                  <Divider style={styles.divider} />
                </View>
                <RadioButton.Group
                  onValueChange={val => handleShow(val === 'true')}
                  value={currentShow ? 'true' : 'false'}>
                  <RadioButton.Item label={t('Show')} value="true" />
                  <RadioButton.Item label={t('Hide')} value="false" />
                </RadioButton.Group>
                <Button mode="text" onPress={() => setShowModal(false)}>
                  {t('Close')}
                </Button>
              </Card.Content>
            </Card>
          </Modal>
        </Portal>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B110E',
    zIndex: 1200,
  },
  toolbar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 1000,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  enableRow: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  enableLabel: {color: '#E6ECE8', fontSize: 13, marginLeft: 8},
  toolbarBtns: {flexDirection: 'row', alignItems: 'center'},
  tbtn: {marginLeft: 6},
  padButton: {
    borderRadius: 16,
    backgroundColor: 'rgba(47,210,75,0.14)',
    borderWidth: 1.5,
    borderColor: '#2FD24B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padLabel: {color: '#E6ECE8', fontSize: 20, fontWeight: '800'},
  modal: {marginLeft: '25%', marginRight: '25%'},
  modalText: {color: '#E6ECE8'},
  title: {paddingTop: 10, paddingBottom: 10},
  divider: {marginTop: 10},
});

export default CoverLayoutOverlay;
