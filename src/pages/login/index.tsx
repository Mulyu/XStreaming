import React from 'react';
import {useLoginScreen} from './model/useLoginScreen';
import LoginView from './ui/LoginView';

function LoginScreen({navigation, route}) {
  const vm = useLoginScreen(navigation, route);
  return <LoginView {...vm} />;
}

export default LoginScreen;
