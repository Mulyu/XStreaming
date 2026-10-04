import React from 'react';
import {IconButton} from 'react-native-paper';
import {useVirtualGamepadSettings} from './model/useVirtualGamepadSettings';
import VirtualGamepadSettingsView from './ui/VirtualGamepadSettingsView';
import {useTVFocus, tvFocusRing} from '../../shared/ui/tvFocus';

function VirtualGamepadSettingsScreen({navigation}) {
  const vm = useVirtualGamepadSettings(navigation);
  const addFocus = useTVFocus();

  React.useEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <IconButton
          icon="plus"
          size={28}
          onPress={vm.onOpenAddModal}
          onFocus={addFocus.onFocus}
          onBlur={addFocus.onBlur}
          style={addFocus.focused && tvFocusRing}
        />
      ),
    });
  }, [navigation, vm.onOpenAddModal, addFocus.focused]);

  return <VirtualGamepadSettingsView {...vm} />;
}

export default VirtualGamepadSettingsScreen;
