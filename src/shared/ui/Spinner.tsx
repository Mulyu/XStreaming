import React from 'react';
import {Modal, StyleProp, StyleSheet, TextStyle, View} from 'react-native';
import {ActivityIndicator, Text, useTheme} from 'react-native-paper';

// The one place spinners are drawn: every loading indicator in the app goes
// through here, so the look (and the colour, once the palette changes) is
// decided in a single file.

type InlineSpinnerProps = {
  /** Paper's sizes: 'small' | 'large' | a number of dp. */
  size?: number | 'small' | 'large';
  /** Defaults to the theme's primary colour. */
  color?: string;
  animating?: boolean;
};

/** The standard spinner, for placing inside a layout. */
export const InlineSpinner: React.FC<InlineSpinnerProps> = ({
  size,
  color,
  animating = true,
}) => {
  const theme = useTheme();
  return (
    <ActivityIndicator
      size={size}
      color={color ?? theme.colors.primary}
      animating={animating}
    />
  );
};

type Props = {
  loading: boolean;
  cancelable?: boolean;
  text?: string;
  textStyle?: StyleProp<TextStyle>;
  closeCb?: () => void;
  onChange?: (value: any) => void;
};

/**
 * Full-screen loading overlay: the standard spinner (plus optional text) over
 * the current screen. Blocks touches while `loading`; with `cancelable` the
 * back button dismisses it.
 */
const Loading: React.FC<Props> = ({
  loading,
  cancelable = false,
  text = '',
  textStyle,
  closeCb,
}) => {
  const theme = useTheme();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!loading) {
      setDismissed(false);
    }
  }, [loading]);

  const onRequestClose = () => {
    if (cancelable) {
      setDismissed(true);
      closeCb?.();
    }
  };

  return (
    <Modal
      visible={loading && !dismissed}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      <View style={styles.overlay}>
        <InlineSpinner size="large" />
        {text ? (
          <Text
            style={StyleSheet.flatten([
              styles.text,
              {color: theme.colors.primary},
              textStyle,
            ])}>
            {text}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontWeight: '500',
  },
});

export default Loading;
