import React from 'react';
import {Alert, NativeModules} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import {useTranslation} from 'react-i18next';
import {
  PsPlusSession,
  PsPlusConnectionState,
  getNpsso,
} from '../../../features/ps-plus-session';
import {debugFactory} from '../../../shared/lib/debug';

const {FullScreenManager} = NativeModules;

const log = debugFactory('PsPlusStreamScreen');

// Xbox-shaped controller state, matching what gpStateToPsPlusInput (see
// features/ps-plus-session) reads -- the same field names native-stream's
// own gpState uses, so the shared VirtualGamepad UI component (built for
// that shape) can drive this screen unmodified.
const createGpState = () => ({
  A: 0,
  B: 0,
  X: 0,
  Y: 0,
  LeftShoulder: 0,
  RightShoulder: 0,
  View: 0,
  Menu: 0,
  LeftThumb: 0,
  RightThumb: 0,
  DPadUp: 0,
  DPadDown: 0,
  DPadLeft: 0,
  DPadRight: 0,
  Nexus: 0,
  LeftTrigger: 0,
  RightTrigger: 0,
  LeftThumbXAxis: 0,
  LeftThumbYAxis: 0,
  RightThumbXAxis: 0,
  RightThumbYAxis: 0,
});

export function usePsPlusStream(navigation: any, route: any) {
  const {t} = useTranslation();
  const params = route.params ?? {};
  const [connectState, setConnectState] =
    React.useState<PsPlusConnectionState>('connecting');
  const [progressText, setProgressText] = React.useState('');
  const [errorDetail, setErrorDetail] = React.useState('');
  const [pinRequest, setPinRequest] = React.useState<{
    pinIncorrect: boolean;
  } | null>(null);

  React.useEffect(() => {
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    return () => {
      Orientation.lockToPortrait();
      FullScreenManager.immersiveModeOff();
    };
  }, []);

  const sessionRef = React.useRef<PsPlusSession | null>(null);
  const gpState = React.useRef(createGpState());

  const flushGpState = React.useCallback(() => {
    sessionRef.current?.setGamepadState(gpState.current);
  }, []);

  React.useEffect(() => {
    const npsso = getNpsso();
    if (!npsso) {
      setConnectState('failed');
      setErrorDetail('Not signed in');
      return;
    }
    const session = new PsPlusSession({
      onState: (state, detail) => {
        setConnectState(state);
        if (detail) {
          setErrorDetail(detail);
        }
      },
      onProgress: stage => setProgressText(stage),
      onLoginPinRequest: pinIncorrect => setPinRequest({pinIncorrect}),
      onRumble: () => {},
      onPsChord: () => {},
    });
    sessionRef.current = session;
    void session.connect({
      npsso,
      serviceType: params.serviceType === 'psnow' ? 'psnow' : 'pscloud',
      gameIdentifier: params.streamIdentifier ?? params.productId ?? '',
      gameName: params.name ?? '',
      ownedEntitlementId: params.isOwned ? params.entitlementId : undefined,
      ownedPlatform: params.isOwned ? params.platform : undefined,
    });

    return () => {
      log.info('Closing PS Plus session');
      session.close();
      sessionRef.current = null;
    };
    // Only the initial route params matter -- this effect owns the session
    // for the screen's whole lifetime, same as native-stream's own connect
    // effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressIn = React.useCallback(
    (name: string) => {
      (gpState.current as any)[name] = 1;
      flushGpState();
    },
    [flushGpState],
  );

  const handlePressOut = React.useCallback(
    (name: string) => {
      (gpState.current as any)[name] = 0;
      flushGpState();
    },
    [flushGpState],
  );

  const handleStickMove = React.useCallback(
    (id: string, data: {x: number; y: number}) => {
      if (id === 'right') {
        gpState.current.RightThumbXAxis = data.x;
        gpState.current.RightThumbYAxis = data.y;
      } else {
        gpState.current.LeftThumbXAxis = data.x;
        gpState.current.LeftThumbYAxis = data.y;
      }
      flushGpState();
    },
    [flushGpState],
  );

  const [pin, setPin] = React.useState('');

  const onSubmitPin = React.useCallback(() => {
    sessionRef.current?.setLoginPin(pin);
    setPinRequest(null);
    setPin('');
  }, [pin]);

  const requestExit = React.useCallback(() => {
    Alert.alert(t('Warning'), t('Exit stream?'), [
      {text: t('Cancel'), style: 'cancel'},
      {
        text: t('Confirm'),
        style: 'destructive',
        onPress: () => navigation.goBack(),
      },
    ]);
  }, [navigation, t]);

  React.useEffect(() => {
    const beforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (e.data.action.type === 'GO_BACK' && connectState === 'connected') {
        e.preventDefault();
        requestExit();
      }
    });
    return beforeRemove;
  }, [navigation, connectState, requestExit]);

  return {
    t,
    title: params.name ?? '',
    connectState,
    progressText,
    errorDetail,
    pinRequest,
    pin,
    onChangePin: setPin,
    onSubmitPin,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
    onStickMove: handleStickMove,
    onRequestExit: requestExit,
  };
}

export type PsPlusStreamViewModel = ReturnType<typeof usePsPlusStream>;
