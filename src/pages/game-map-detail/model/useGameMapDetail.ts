import React from 'react';
import {NativeModules, NativeEventEmitter} from 'react-native';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../../../shared/lib/debug';
import {legendIcons as maping} from '../../../entities/gamepad';

const log = debugFactory('GameMapDetailScreen');

const {GamepadManager} = NativeModules;

export function useGameMapDetail(navigation: any, route: any) {
  const {t} = useTranslation();

  React.useEffect(() => {
    log.info('TitleDetail button:', route.params?.button);
    GamepadManager.setCurrentScreen('stream');
    const eventEmitter = new NativeEventEmitter();
    const gpDownEventListener = eventEmitter.addListener(
      'onGamepadKeyDown',
      event => {
        console.log('onGamepadKeyDown:', event);
        const keyCode = event.keyCode;
        navigation.navigate('NativeGameMap', {
          button: route.params?.button,
          keyCode,
        });
      },
    );

    const dpDownEventListener = eventEmitter.addListener(
      'onDpadKeyDown',
      event => {
        console.log('onDpadKeyDown:', event);
        const keyCode = event.dpadIdx;
        navigation.navigate('NativeGameMap', {
          button: route.params?.button,
          keyCode,
        });
      },
    );

    return () => {
      gpDownEventListener && gpDownEventListener.remove();
      dpDownEventListener && dpDownEventListener.remove();
      GamepadManager.setCurrentScreen('');
    };
  }, [route.params?.button, navigation]);

  const current = route.params?.button;
  console.log('current:', current);

  return {
    t,
    buttonIconXml: maping[current],
  };
}

export type GameMapDetailViewModel = ReturnType<typeof useGameMapDetail>;
