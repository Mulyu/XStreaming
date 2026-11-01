import React from 'react';
import {Modal, Pressable, StyleSheet, TextInput, View} from 'react-native';
import {Icon} from 'react-native-paper';
import {TV_FOCUS_COLOR, tvFocusRing, useTVFocus} from './tvFocus';
import {alpha, palette} from '../config/palette';

type Props = {
  visible: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  placeholder: string;
  closeLabel: string;
};

// TV search: a full-screen overlay with one input (the TV keyboard or the
// remote's voice input fills it in) and a close button. The list behind it
// filters as the text changes.
const TvSearchModal: React.FC<Props> = ({
  visible,
  value,
  onChangeText,
  onClose,
  placeholder,
  closeLabel,
}) => {
  const input = useTVFocus();
  const close = useTVFocus();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, input.focused && styles.boxFocused]}>
          <Icon
            source="magnify"
            size={20}
            color={input.focused ? TV_FOCUS_COLOR : palette.textSoft}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.textSoft}
            style={styles.input}
            onFocus={input.onFocus}
            onBlur={input.onBlur}
            onSubmitEditing={onClose}
            returnKeyType="search"
            autoFocus
          />
          <Pressable
            style={[styles.close, close.focused && tvFocusRing]}
            onPress={onClose}
            onFocus={close.onFocus}
            onBlur={close.onBlur}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}>
            <Icon
              source="close"
              size={18}
              color={close.focused ? TV_FOCUS_COLOR : palette.text}
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: alpha(palette.scrim, 0.72),
    alignItems: 'center',
    paddingTop: 90,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '70%',
    maxWidth: 640,
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: palette.surfaceHigh,
    borderWidth: 2,
    borderColor: alpha(palette.text, 0.24),
  },
  boxFocused: {borderColor: TV_FOCUS_COLOR},
  input: {flex: 1, padding: 0, fontSize: 18, color: palette.text},
  close: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});

export default TvSearchModal;
