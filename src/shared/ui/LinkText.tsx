import React from 'react';
import {Text, TouchableOpacity, Linking, StyleSheet} from 'react-native';
import {useTVFocus, tvFocusRing} from './tvFocus';

type Props = {
  url: string;
  children: React.ReactNode;
};

const LinkText: React.FC<Props> = ({url, children}) => {
  const {focused, onFocus, onBlur} = useTVFocus();
  const handlePress = () => {
    Linking.openURL(url); // 点击时打开链接
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={focused && tvFocusRing}>
      <Text style={styles.text}>{children}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  text: {
    color: '#0081f1',
    textDecorationLine: 'underline',
  },
});

export default LinkText;
