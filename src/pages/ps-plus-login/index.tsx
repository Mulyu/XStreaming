import React from 'react';
import {usePsPlusLogin} from './model/usePsPlusLogin';
import PsPlusLoginView from './ui/PsPlusLoginView';

function PsPlusLoginScreen({navigation}) {
  const vm = usePsPlusLogin(navigation);
  return <PsPlusLoginView {...vm} />;
}

export default PsPlusLoginScreen;
