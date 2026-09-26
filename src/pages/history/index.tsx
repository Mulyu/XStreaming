import React from 'react';
import {useHistoryScreen} from './model/useHistoryScreen';
import HistoryView from './ui/HistoryView';

function HistoryScreen() {
  const vm = useHistoryScreen();
  return <HistoryView {...vm} />;
}

export default HistoryScreen;
