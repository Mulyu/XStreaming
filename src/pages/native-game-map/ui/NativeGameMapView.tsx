import React from 'react';
import {View, StyleSheet, FlatList} from 'react-native';
import {Button} from 'react-native-paper';
import {MapItem} from '../../../entities/gamepad';
import type {NativeGameMapViewModel} from '../model/useNativeGameMap';

type Props = NativeGameMapViewModel;

const NativeGameMapView: React.FC<Props> = ({
  t,
  renderDatas,
  onItemPress,
  onSave,
  onReset,
}) => {
  return (
    <View style={styles.container}>
      <FlatList
        style={styles.scrollView}
        data={renderDatas}
        numColumns={2}
        renderItem={({item}) => {
          return (
            <View style={styles.listItem}>
              <MapItem mapItem={item} onPress={onItemPress} />
            </View>
          );
        }}
      />

      <View style={styles.buttonWrap}>
        <Button mode="contained" style={styles.button} onPress={onSave}>
          {t('Save Maping')}
        </Button>
        <Button mode="outlined" style={styles.button} onPress={onReset}>
          {t('Reset')}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: '#fff',
  },
  scrollView: {
    marginBottom: 150,
  },
  listItem: {
    width: '50%',
    justifyContent: 'center',
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 20,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default NativeGameMapView;
