import React from 'react';
import {useCoverScreen} from './model/useCoverScreen';
import CoverScreenView from './ui/CoverScreenView';

export default function CoverScreen() {
  const vm = useCoverScreen();
  return <CoverScreenView {...vm} />;
}
