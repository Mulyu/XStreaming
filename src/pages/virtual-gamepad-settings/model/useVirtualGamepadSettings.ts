import React from 'react';
import {useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../../../shared/lib/settings';
import {getVirtualGamepadLayouts as getSettings} from '../../../features/controller-customization';
import {shiftColor} from '../../../shared/lib/themeColor';

export function useVirtualGamepadSettings(navigation: any) {
  const {t} = useTranslation();
  const theme = useTheme();
  const [value, setValue] = React.useState('');
  const [name, setName] = React.useState('');
  const [userSettings, setUserSettings] = React.useState<any>({});
  const [settings, setSettings] = React.useState<any>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);

  // The editor can now create/delete/switch profiles on its own (its
  // profile-switcher unifies with the in-stream quick-editor's own one), so
  // this list and the active-profile selection can go stale from that alone
  // -- reload on every return to this screen, not just its first mount.
  React.useEffect(() => {
    const reload = () => {
      const _settings = getSettings();
      setSettings(Object.keys(_settings));

      const _userSettings = getUserSettings();
      setUserSettings(_userSettings);
      setValue(_userSettings.custom_virtual_gamepad || '');
    };
    reload();
    const unsubscribe = navigation.addListener('focus', reload);
    return unsubscribe;
  }, [navigation]);

  const onSave = () => {
    userSettings.custom_virtual_gamepad = value;
    setUserSettings(userSettings);
    saveUserSettings(userSettings);
    navigation.goBack();
  };

  const onEdit = () => {
    navigation.navigate('CustomGamepad', {name: value});
  };

  const onBack = () => navigation.goBack();

  const onChangeName = (text: string) => setName(text);

  let errorText = '';
  let isError = false;
  if (!name.trim()) {
    isError = true;
    errorText = t('Name can not be empty');
  }

  const onOpenAddModal = () => setShowAddModal(true);
  const onDismissAddModal = () => setShowAddModal(false);

  const onConfirmAddModal = () => {
    const _name = name;
    if (!isError) {
      setShowAddModal(false);
      setName('');
      setTimeout(() => {
        navigation.navigate('CustomGamepad', {name: _name});
      }, 300);
    }
  };

  const heroCardStyle = React.useMemo(
    () => [{backgroundColor: shiftColor(theme.colors.primary, -0.82)}],
    [theme.colors.primary],
  );
  const heroDescStyle = React.useMemo(
    () => [{color: shiftColor(theme.colors.primary, 0.72)}],
    [theme.colors.primary],
  );
  const heroHintStyle = React.useMemo(
    () => [{color: shiftColor(theme.colors.primary, 0.55)}],
    [theme.colors.primary],
  );

  return {
    t,
    value,
    name,
    settings,
    showAddModal,
    isError,
    errorText,
    heroCardStyle,
    heroDescStyle,
    heroHintStyle,
    onChangeName,
    onSelectValue: setValue,
    onSave,
    onEdit,
    onBack,
    onOpenAddModal,
    onDismissAddModal,
    onConfirmAddModal,
  };
}

export type VirtualGamepadSettingsViewModel = ReturnType<
  typeof useVirtualGamepadSettings
>;
