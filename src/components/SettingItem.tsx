import React from 'react';
import {List, Divider} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  title: string;
  description?: string;
  onPress: () => void;
};

const SettingItem: React.FC<Props> = ({title, description, onPress}) => {
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
          <Ionicons name={'chevron-forward-outline'} size={20} color="#fff" />
        )}
        onPress={handlePress}
      />
      <Divider />
    </>
  );
};

export default SettingItem;
