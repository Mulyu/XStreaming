import React from 'react';
import {List, Divider} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useTVFocus, tvFocusRow} from './tvFocus';
import {palette} from '../config/palette';

type Props = {
  title: string;
  description?: string;
  onPress: () => void;
  // Long press (hold OK on a TV remote); optional.
  onLongPress?: () => void;
};

const SettingItem: React.FC<Props> = ({
  title,
  description,
  onPress,
  onLongPress,
}) => {
  const {focused, onFocus, onBlur} = useTVFocus();
  const handlePress = () => {
    onPress && onPress();
  };

  return (
    <>
      <List.Item
        title={title}
        description={description}
        descriptionNumberOfLines={4}
        right={() => (
          <Ionicons
            name={'chevron-forward-outline'}
            size={20}
            color={palette.white}
          />
        )}
        onPress={handlePress}
        onLongPress={onLongPress}
        onFocus={onFocus}
        onBlur={onBlur}
        style={focused && tvFocusRow}
      />
      <Divider />
    </>
  );
};

export default SettingItem;
