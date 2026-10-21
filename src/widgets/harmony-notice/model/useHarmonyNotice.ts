import React from 'react';
import {Linking, NativeModules} from 'react-native';
import {getSettings, saveSettings} from '../../../shared/lib/settings';
import {useTVFocus} from '../../../shared/ui/tvFocus';

const {FullScreenManager} = NativeModules;

const HARMONY_URL =
  'https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh';

// One-time notice (Chinese-locale Huawei devices only) pointing at the native
// HarmonyOS build. Moved here from the Home screen, which no longer exists.
export function useHarmonyNotice() {
  const [visible, setVisible] = React.useState(false);
  const disableFocus = useTVFocus();
  const installFocus = useTVFocus();

  React.useEffect(() => {
    const settings = getSettings();
    const deviceInfos = FullScreenManager.getDeviceInfos();
    if (
      deviceInfos &&
      deviceInfos.factor.indexOf('HUAWEI') > -1 &&
      settings.locale === 'zh' &&
      settings.show_harmony_modal
    ) {
      setVisible(true);
    }
  }, []);

  const onDismiss = () => setVisible(false);

  const onDisable = () => {
    saveSettings({...getSettings(), show_harmony_modal: false});
    setVisible(false);
  };

  const onInstall = () => {
    Linking.openURL(HARMONY_URL);
    setVisible(false);
  };

  return {
    visible,
    disableFocus,
    installFocus,
    onDismiss,
    onDisable,
    onInstall,
  };
}

export type HarmonyNoticeViewModel = ReturnType<typeof useHarmonyNotice>;
