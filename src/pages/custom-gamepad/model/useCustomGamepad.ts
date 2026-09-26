import React from 'react';
import Orientation from 'react-native-orientation-locker';
import {NativeModules, Dimensions} from 'react-native';
import {useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {PickableKey} from '../../../features/virtual-keyboard';
import {
  getVirtualGamepadLayouts as getSettings,
  saveVirtualGamepadLayout as saveSettings,
  deleteVirtualGamepadLayout as deleteSetting,
  getSwipeConfig,
  setSwipeConfig,
  getJoystickMode,
  setJoystickMode,
  createDefaultMacroLayoutButtons,
  ensureMacroLayoutButtons,
  isMacroButtonName,
  normalizeMacroLoopIntervalMs,
  normalizeMacroStep,
  VirtualMacroStep,
  buildDefaultLayout,
  snapToGrid,
  SWIPE_AIM_NAME,
  SWIPE_AIM_MIN,
  createDefaultSwipePad,
  ensureSwipePad,
} from '../../../features/controller-customization';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../../../shared/lib/settings';

const {FullScreenManager} = NativeModules;

// A title's own virtual-gamepad layout editor: drag to reposition, tap to
// open a per-button panel (size/show/turbo/hold, or a macro step editor for
// Macro1/2/3), plus a swipe-aim pad users can drag and resize. Everything
// (buttons, swipe config, joystick mode) is written back into `buttons` --
// or its own store for swipe/joystick -- and only persisted on Save.
export function useCustomGamepad(navigation: any, route: any) {
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
    setCurrentScale(scale);
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

  const onExit = () => navigation.navigate('VirtualGamepadSettings');

  const onSelectSwipePad = (name: string, show: boolean) => {
    setCurrentButton(name);
    setCurrentShow(show ?? true);
    setShowSwipeModal(true);
  };

  const onSelectStick = (name: string, show: boolean, turbo: boolean) => {
    setCurrentButton(name);
    setCurrentScale(1);
    setCurrentShow(show ?? true);
    setCurrentTurbo(turbo ?? false);
    setShowModal(true);
  };

  const onSelectButton = (button: any) => {
    setCurrentButton(button.name);
    setCurrentScale(button.scale || 1);
    setCurrentShow(button.show ?? true);
    setCurrentTurbo(button.turbo ?? false);
    setCurrentHold(button.holdToggle ?? false);
    if (isMacroButtonName(button.name)) {
      setMacroSteps(Array.isArray(button.macroSteps) ? button.macroSteps : []);
      setMacroLoopEnabled(!!button.macroLoopEnabled);
      setMacroLoopIntervalMs(
        normalizeMacroLoopIntervalMs(button.macroLoopIntervalMs),
      );
    }
    setShowModal(true);
  };

  const onDragReleaseWithReload = (name: string, bounds: any) => {
    handleDrag(name, bounds.left, bounds.top);
    setReloader(Date.now());
  };

  const onResizePadWithReload = (hx: number, hy: number) => {
    handleResizePad(hx, hy);
    setReloader(Date.now());
  };

  return {
    t,
    primaryColor: theme.colors.primary,
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
  };
}

export type CustomGamepadViewModel = ReturnType<typeof useCustomGamepad>;
