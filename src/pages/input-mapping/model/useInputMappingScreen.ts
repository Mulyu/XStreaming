import React from 'react';
import {Alert, BackHandler} from 'react-native';
import {useTranslation} from 'react-i18next';
import {
  BINDING_TARGETS,
  BindingTarget,
  assignKey,
  assignMouse,
  getInputBindings,
  inputsForTarget,
  isStickDirection,
  keyLabel,
  resetInputBindings,
  saveInputBindings,
  unbindKey,
  unbindMouse,
  useKeyCapture,
  InputBindings,
} from '../../../features/physical-input';

export type MappingTab = 'gamepad' | 'kbm' | 'virtual';

// One list row: a gamepad input and the keys / mouse buttons that stand for it.
export type MappingRow = {
  target: BindingTarget;
  label: string;
  // Display labels of what is bound, in order (keys first).
  chips: string[];
};

export function useInputMappingScreen(navigation: any) {
  const {t} = useTranslation();
  const [tab, setTab] = React.useState<MappingTab>('kbm');
  const [bindings, setBindings] = React.useState<InputBindings>(() =>
    getInputBindings(),
  );
  // The target being edited in the dialog, and whether the next key press is
  // being waited for.
  const [editing, setEditing] = React.useState<BindingTarget | null>(null);
  const [capturing, setCapturing] = React.useState(false);

  const targetLabel = React.useCallback(
    (target: BindingTarget) => t(`InputTarget_${target}`),
    [t],
  );
  const mouseLabel = React.useCallback(
    (button: number) => t(`MouseButton_${button}`),
    [t],
  );

  const update = (next: InputBindings) => {
    saveInputBindings(next);
    setBindings(next);
  };

  useKeyCapture(capturing && editing !== null, keyCode => {
    if (editing) {
      update(assignKey(bindings, keyCode, editing));
    }
    setCapturing(false);
  });

  // Back closes the dialog first instead of leaving the screen.
  React.useEffect(() => {
    if (editing === null) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setEditing(null);
        setCapturing(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [editing]);

  const rows: MappingRow[] = BINDING_TARGETS.map(target => {
    const inputs = inputsForTarget(bindings, target);
    return {
      target,
      label: targetLabel(target),
      chips: [...inputs.keys.map(keyLabel), ...inputs.mouse.map(mouseLabel)],
    };
  });

  const editingInputs = editing ? inputsForTarget(bindings, editing) : null;

  const handleReset = () => {
    Alert.alert(t('Warning'), t('InputMappingResetConfirm'), [
      {text: t('Cancel'), style: 'cancel'},
      {
        text: t('Confirm'),
        style: 'destructive',
        onPress: () => setBindings(resetInputBindings()),
      },
    ]);
  };

  return {
    t,
    tab,
    onChangeTab: setTab,
    rows,
    editing,
    editingLabel: editing ? targetLabel(editing) : '',
    // The mouse can't move the stick, so a stick direction has no mouse list.
    editingAllowsMouse: editing ? !isStickDirection(editing) : false,
    editingKeys: (editingInputs?.keys ?? []).map(code => ({
      code,
      label: keyLabel(code),
    })),
    editingMouse: (editingInputs?.mouse ?? []).map(button => ({
      button,
      label: mouseLabel(button),
    })),
    mouseOptions: [0, 1, 2, 3, 4].map(button => ({
      button,
      label: mouseLabel(button),
      bound: editing ? bindings.mouse[button] === editing : false,
      boundElsewhere:
        editing !== null &&
        bindings.mouse[button] !== undefined &&
        bindings.mouse[button] !== editing,
    })),
    capturing,
    onOpenTarget: (target: BindingTarget) => {
      setEditing(target);
      setCapturing(false);
    },
    onCloseDialog: () => {
      setEditing(null);
      setCapturing(false);
    },
    onStartCapture: () => setCapturing(true),
    onCancelCapture: () => setCapturing(false),
    onRemoveKey: (code: number) => update(unbindKey(bindings, code)),
    onToggleMouse: (button: number) => {
      if (!editing || isStickDirection(editing)) {
        return;
      }
      update(
        bindings.mouse[button] === editing
          ? unbindMouse(bindings, button)
          : assignMouse(bindings, button, editing),
      );
    },
    onReset: handleReset,
    onOpenGamepadMap: () => navigation.navigate('NativeGameMap'),
    onOpenVirtualGamepad: () => navigation.navigate('VirtualGamepadSettings'),
  };
}

export type InputMappingViewModel = ReturnType<typeof useInputMappingScreen>;
