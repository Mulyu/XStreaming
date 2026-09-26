import React from 'react';
import {useGameMapDetail} from './model/useGameMapDetail';
import GameMapDetailView from './ui/GameMapDetailView';

function GameMapDetail({navigation, route}) {
  const vm = useGameMapDetail(navigation, route);
  return <GameMapDetailView {...vm} />;
}

export default GameMapDetail;
