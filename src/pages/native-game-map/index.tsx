import React from 'react';
import {useNativeGameMap} from './model/useNativeGameMap';
import NativeGameMapView from './ui/NativeGameMapView';

function NativeGameMap({navigation, route}) {
  const vm = useNativeGameMap(navigation, route);
  return <NativeGameMapView {...vm} />;
}

export default NativeGameMap;
