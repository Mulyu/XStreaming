import React from 'react';
import {usePsPlusStream} from './model/usePsPlusStream';
import PsPlusStreamView from './ui/PsPlusStreamView';

function PsPlusStreamScreen({navigation, route}) {
  const vm = usePsPlusStream(navigation, route);
  return <PsPlusStreamView {...vm} />;
}

export default PsPlusStreamScreen;
