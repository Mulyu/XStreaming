import React from 'react';
import {useLibraryTitleDetail} from './model/useLibraryTitleDetail';
import LibraryTitleDetailView from './ui/LibraryTitleDetailView';

function LibraryTitleDetailScreen() {
  const vm = useLibraryTitleDetail();
  return <LibraryTitleDetailView {...vm} />;
}

export default LibraryTitleDetailScreen;
