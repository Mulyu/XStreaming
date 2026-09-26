import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import {SvgXml} from 'react-native-svg';
import type {GameMapDetailViewModel} from '../model/useGameMapDetail';

type Props = GameMapDetailViewModel;

const GameMapDetailView: React.FC<Props> = ({t, buttonIconXml}) => {
  return (
    <View style={styles.container}>
      <ScrollView>
        <Text style={styles.text}>
          {t(
            'Please press the button on the controller, which will be mapped to:',
          )}
        </Text>
        <View style={styles.flex}>
          <SvgXml xml={buttonIconXml} width="50" height="50" />
        </View>
        <Text style={styles.text}>
          {t('After successful mapping, this pop-up will automatically close')}
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    padding: 10,
  },
  text: {
    color: '#333',
    marginTop: 10,
    marginBottom: 10,
  },
  flex: {
    flex: 1,
    alignItems: 'center',
  },
});

export default GameMapDetailView;
