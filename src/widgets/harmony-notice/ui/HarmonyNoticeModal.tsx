import React from 'react';
import {Button, Text, Portal, Modal, Card} from 'react-native-paper';
import {StyleSheet} from 'react-native';
import {tvFocusRing} from '../../../shared/ui/tvFocus';
import type {HarmonyNoticeViewModel} from '../model/useHarmonyNotice';

const HarmonyNoticeModal: React.FC<HarmonyNoticeViewModel> = ({
  visible,
  disableFocus,
  installFocus,
  onDismiss,
  onDisable,
  onInstall,
}) => {
  if (!visible) {
    return null;
  }
  return (
    <Portal>
      <Modal
        visible={true}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}>
        <Card>
          <Card.Content>
            <Text>
              XStreaming鸿蒙版已正式发布App Gallery，如您的设备系统为HarmonyOS
              5以上，您可以安装原生版本以获得更好的串流体验(点击立即下载或应用商店搜索"XStreaming"进行安装)。
            </Text>

            <Button
              mode="text"
              onPress={onDisable}
              onFocus={disableFocus.onFocus}
              onBlur={disableFocus.onBlur}
              style={disableFocus.focused && tvFocusRing}>
              不再提示
            </Button>
            <Button
              mode="elevated"
              onPress={onInstall}
              onFocus={installFocus.onFocus}
              onBlur={installFocus.onBlur}
              style={installFocus.focused && tvFocusRing}>
              去安装
            </Button>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {marginLeft: '4%', marginRight: '4%'},
});

export default HarmonyNoticeModal;
