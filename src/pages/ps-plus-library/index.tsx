import React from 'react';
import {usePsPlusLibrary} from './model/usePsPlusLibrary';
import PsPlusLibraryView from './ui/PsPlusLibraryView';

function PsPlusLibraryScreen({navigation}) {
  const vm = usePsPlusLibrary(navigation);
  return <PsPlusLibraryView {...vm} />;
}

export default PsPlusLibraryScreen;
