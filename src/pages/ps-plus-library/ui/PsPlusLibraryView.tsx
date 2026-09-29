import React from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  Image,
  TextInput,
  Pressable,
} from 'react-native';
import {Text, Icon, Button, ActivityIndicator} from 'react-native-paper';
import type {CloudGame} from '../../../features/ps-plus-session';
import type {
  PsPlusLibraryViewModel,
  PsPlusPlatformFilter,
} from '../model/usePsPlusLibrary';

const PS_ACCENT = '#0070D1';
const PLATFORM_CHIPS: PsPlusPlatformFilter[] = ['ps5', 'ps4', 'ps3'];

type Props = PsPlusLibraryViewModel;

const PsPlusLibraryView: React.FC<Props> = ({
  t,
  signedIn,
  games,
  totalCount,
  loading,
  refreshing,
  error,
  keyword,
  setKeyword,
  filterOwned,
  setFilterOwned,
  filterStreamable,
  setFilterStreamable,
  platformFilters,
  togglePlatformFilter,
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('PsPlusLibraryTitle')}</Text>
          {totalCount > 0 && (
            <Text style={styles.count}>
              {games.length}/{totalCount}
            </Text>
          )}
          <Button mode="text" onPress={onSignOut} style={styles.signOutButton}>
            {t('SignOut')}
          </Button>
        </View>
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color="#8A9A92" />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder={t('Search')}
            placeholderTextColor="#8A9A92"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.chipsRow}>
          <Pressable
            style={[styles.filterChip, filterOwned && styles.filterChipOn]}
            onPress={setFilterOwned}>
            <Text
              style={[
                styles.filterChipText,
                filterOwned && styles.filterChipTextOn,
              ]}>
              {t('LibraryFilterOwned')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterStreamable && styles.filterChipOn]}
            onPress={setFilterStreamable}>
            <Text
              style={[
                styles.filterChipText,
                filterStreamable && styles.filterChipTextOn,
              ]}>
              {t('PsPlusFilterIncluded')}
            </Text>
          </Pressable>
          {PLATFORM_CHIPS.map(platform => {
            const on = platformFilters.has(platform);
            return (
              <Pressable
                key={platform}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => togglePlatformFilter(platform)}>
                <Text
                  style={[
                    styles.filterChipText,
                    on && styles.filterChipTextOn,
                  ]}>
                  {platform.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {games.length === 0 && totalCount > 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('NoResults')}</Text>
        </View>
      ) : (
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
      )}
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
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A9A92',
  },
  signOutButton: {
    marginLeft: 'auto',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  searchInput: {
    flex: 1,
    padding: 0,
    fontSize: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(140,140,150,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(140,140,150,0.24)',
  },
  filterChipOn: {
    backgroundColor: PS_ACCENT,
    borderColor: PS_ACCENT,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#8A9A92',
  },
  filterChipTextOn: {
    color: '#fff',
  },
  emptyText: {
    color: '#8A9A92',
    fontSize: 14,
    textAlign: 'center',
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
