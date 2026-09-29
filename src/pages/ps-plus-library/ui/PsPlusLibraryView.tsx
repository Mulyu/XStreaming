import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  Image,
  Pressable,
} from 'react-native';
import {Text, Button, ActivityIndicator} from 'react-native-paper';
import type {CloudGame} from '../../../features/ps-plus-session';
import type {PsPlusLibraryViewModel} from '../model/usePsPlusLibrary';

const PS_ACCENT = '#0070D1';

type Props = PsPlusLibraryViewModel;

const PsPlusLibraryView: React.FC<Props> = ({
  t,
  signedIn,
  games,
  loading,
  refreshing,
  error,
  onRefresh,
  onSignIn,
  onSignOut,
  onSelectGame,
}) => {
  if (!signedIn) {
    return (
      <View style={styles.centered}>
        <Text style={styles.signInTitle}>{t('PsPlusSignInPrompt')}</Text>
        <Button mode="contained" buttonColor={PS_ACCENT} onPress={onSignIn}>
          {t('PsPlusLogin')}
        </Button>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={PS_ACCENT} />
      </View>
    );
  }

  const renderItem = ({item}: {item: CloudGame}) => (
    <Pressable style={styles.tile} onPress={() => onSelectGame(item)}>
      {item.imageUrl ? (
        <Image source={{uri: item.imageUrl}} style={styles.tileImage} />
      ) : (
        <View style={[styles.tileImage, styles.tileImageFallback]} />
      )}
      <Text style={styles.tileTitle} numberOfLines={2}>
        {item.name}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('PsPlusLibraryTitle')}</Text>
        <Button mode="text" onPress={onSignOut}>
          {t('SignOut')}
        </Button>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={games}
        key={games.length}
        keyExtractor={item => item.productId}
        numColumns={3}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.grid}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  signInTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  error: {
    color: '#E67E22',
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  grid: {
    padding: 8,
  },
  tile: {
    flex: 1 / 3,
    padding: 6,
  },
  tileImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  tileImageFallback: {},
  tileTitle: {
    marginTop: 4,
    fontSize: 12,
  },
});

export default PsPlusLibraryView;
