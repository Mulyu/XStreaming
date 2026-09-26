import React from 'react';
import {IconButton} from 'react-native-paper';
import {useVirtualGamepadSettings} from './model/useVirtualGamepadSettings';
import VirtualGamepadSettingsView from './ui/VirtualGamepadSettingsView';

function VirtualGamepadSettingsScreen({navigation}) {
  const vm = useVirtualGamepadSettings(navigation);

  React.useEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <IconButton icon="plus" size={28} onPress={vm.onOpenAddModal} />
      ),
    });
  }, [navigation, vm.onOpenAddModal]);

  return <VirtualGamepadSettingsView {...vm} />;
}

export default VirtualGamepadSettingsScreen;
