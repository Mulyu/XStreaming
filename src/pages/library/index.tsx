import React from 'react';
import {useLibraryScreen} from './model/useLibraryScreen';
import LibraryView from './ui/LibraryView';

function LibraryScreen() {
  const vm = useLibraryScreen();
  return <LibraryView {...vm} />;
}

export default LibraryScreen;
