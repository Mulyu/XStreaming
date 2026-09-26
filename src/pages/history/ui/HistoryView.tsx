import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Card} from 'react-native-paper';
import Spinner from '../../../shared/ui/Spinner';
import type {HistoryScreenViewModel} from '../model/useHistoryScreen';

type Props = HistoryScreenViewModel;

const HistoryView: React.FC<Props> = ({loading, releaseCards}) => {
  return (
    <ScrollView style={styles.container}>
      <Spinner loading={loading} cancelable={true} />

      <View style={styles.block}>
        <View>
          {releaseCards.map(release => {
            return (
              <Card key={release.id} style={{marginBottom: 30}}>
                <Card.Content>
                  <Text variant="titleLarge">{release.name}</Text>
                  <Text variant="bodyMedium">{release.body}</Text>
                </Card.Content>
              </Card>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  block: {
    marginBottom: 50,
  },
  title: {
    marginBottom: 10,
  },
});

export default HistoryView;
