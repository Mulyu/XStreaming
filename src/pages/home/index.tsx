import React from 'react';
import {useHomeScreen} from './model/useHomeScreen';
import HomeView from './ui/HomeView';

function HomeScreen({navigation, route}) {
  const vm = useHomeScreen(navigation, route);
  return <HomeView {...vm} />;
}

export default HomeScreen;
