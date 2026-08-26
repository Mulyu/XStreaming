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
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Orientation from 'react-native-orientation-locker';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import {coverGamepadBus} from '../utils/coverGamepadBus';
import {
  getCoverLayout,
  saveCoverLayout,
  defaultCoverLayout,
  CoverButton,
} from '../store/coverLayoutStore';

const {FullScreenManager, CoverDisplayManager} = NativeModules;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Edits the foldable cover-screen button layout from the inner screen. The
// inner screen stands in for the cover: drag to move, tap to size/hide. While
// open it presents the real cover so changes preview live there too.
function CoverLayoutEditorScreen({navigation, route}: any) {
  const {t} = useTranslation();
  const theme = useTheme();
  const profileName = route?.params?.name ?? '';
  const {width: W, height: H} = useWindowDimensions();
  const [buttons, setButtons] = React.useState<CoverButton[]>([]);
  const [current, setCurrent] = React.useState('');
  const [currentSize, setCurrentSize] = React.useState(0.18);
  const [currentShow, setCurrentShow] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(Date.now());

  React.useEffect(() => {
    FullScreenManager?.immersiveModeOn?.();
    Orientation.lockToLandscape();
    const initial = getCoverLayout(profileName);
    setButtons(initial);
    coverGamepadBus.setLayout(initial);
    coverGamepadBus.setActive(true);
    CoverDisplayManager?.present?.('XCoverScreen')?.catch?.(() => {});
    return () => {
      CoverDisplayManager?.dismiss?.();
      coverGamepadBus.setActive(false);
      // Reset the live layout to the saved one so later presents don't reuse an
      // unsaved edit.
      coverGamepadBus.setLayout(getCoverLayout(profileName));
      Orientation.unlockAllOrientations();
      FullScreenManager?.immersiveModeOff?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileName]);

  const apply = (next: CoverButton[]) => {
    setButtons(next);
    coverGamepadBus.setLayout(next);
  };

  const handleDrag = (name: string, px: number, py: number) => {
    apply(
      buttons.map(b => {
        if (b.name !== name) {
          return b;
        }
        const maxX = 1 - b.size;
        const maxY = 1 - (b.size * W) / H;
        return {
          ...b,
          x: clamp(px / W, 0, Math.max(0, maxX)),
          y: clamp(py / H, 0, Math.max(0, maxY)),
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
    setReloadKey(Date.now());
  };

  const handleSave = () => {
    saveCoverLayout(profileName, buttons);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.hint}>{t('CoverLayoutEditHint')}</Text>
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
            onPress={() => navigation.goBack()}
            style={styles.tbtn}>
            {t('Cancel')}
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
              setReloadKey(Date.now());
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
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0B110E'},
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
  hint: {color: '#8A9A92', fontSize: 12, flexShrink: 1, marginRight: 8},
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

export default CoverLayoutEditorScreen;
