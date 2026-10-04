import React from 'react';
import {View, StyleSheet, FlatList} from 'react-native';
import {Button} from 'react-native-paper';
import {MapItem} from '../../../entities/gamepad';
import type {NativeGameMapViewModel} from '../model/useNativeGameMap';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';

type Props = NativeGameMapViewModel;

const NativeGameMapView: React.FC<Props> = ({
  t,
  renderDatas,
  onItemPress,
  onSave,
  onReset,
}) => {
  const saveFocus = useTVFocus();
  const resetFocus = useTVFocus();

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
        <Button
          mode="contained"
          style={[styles.button, saveFocus.focused && tvFocusRing]}
          onPress={onSave}
          onFocus={saveFocus.onFocus}
          onBlur={saveFocus.onBlur}>
          {t('Save Maping')}
        </Button>
        <Button
          mode="outlined"
          style={[styles.button, resetFocus.focused && tvFocusRing]}
          onPress={onReset}
          onFocus={resetFocus.onFocus}
          onBlur={resetFocus.onBlur}>
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
