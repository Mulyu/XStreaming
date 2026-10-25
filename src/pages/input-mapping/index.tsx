import React from 'react';
import {useInputMappingScreen} from './model/useInputMappingScreen';
import InputMappingView from './ui/InputMappingView';

function InputMappingScreen({navigation}) {
  const vm = useInputMappingScreen(navigation);
  return <InputMappingView {...vm} />;
}

export default InputMappingScreen;
