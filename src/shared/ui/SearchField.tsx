import React from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {Icon} from 'react-native-paper';
import {TV_FOCUS_COLOR, tvFocusRing, useTVFocus} from './tvFocus';
import {alpha, palette} from '../config/palette';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  clearLabel: string;
  autoFocus?: boolean;
};

// The phone's always-visible search box: icon, input, and a clear button once
// there is text. (On TV the screens use a button that opens TvSearchModal
// instead -- typing with a remote is slow.)
const SearchField: React.FC<Props> = ({
  value,
  onChangeText,
  placeholder,
  clearLabel,
  autoFocus,
}) => {
  const box = useTVFocus();
  const clear = useTVFocus();
  return (
    <View style={[styles.box, box.focused && styles.boxFocused]}>
      <Icon
        source="magnify"
        size={18}
        color={box.focused ? TV_FOCUS_COLOR : palette.textSoft}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSoft}
        style={styles.input}
        onFocus={box.onFocus}
        onBlur={box.onBlur}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          style={[styles.clear, clear.focused && tvFocusRing]}
          onPress={() => onChangeText('')}
          onFocus={clear.onFocus}
          onBlur={clear.onBlur}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}>
          <Icon source="close" size={18} color={palette.textSoft} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: alpha(palette.text, 0.14),
    // Constant border width: gaining the focus ring never resizes the box.
    borderWidth: 2,
    borderColor: alpha(palette.text, 0.24),
  },
  boxFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: alpha(palette.focusRing, 0.1),
  },
  input: {flex: 1, padding: 0, fontSize: 14, color: palette.text},
  clear: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});

export default SearchField;
