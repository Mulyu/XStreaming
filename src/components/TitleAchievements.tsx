import React from 'react';
import {StyleSheet, View, ScrollView, Image, Pressable} from 'react-native';
import {Text, ProgressBar, ActivityIndicator} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useTranslation} from 'react-i18next';
import {useSelector} from 'react-redux';
import WebApi from '../web';
import {debugFactory} from '../utils/debug';

const log = debugFactory('TitleAchievements');

type Props = {
  titleId?: string;
  titleName?: string;
  navigation: any;
  accent?: string;
};

// An achievement's gamerscore reward (falling back to the first reward, which
// the existing achievement screens treat the same way).
const gamerscoreOf = (item: any): number => {
  const rewards = Array.isArray(item?.rewards) ? item.rewards : [];
  const reward =
    rewards.find((r: any) => r?.type === 'Gamerscore') || rewards[0];
  const n = Number(reward?.value);
  return Number.isFinite(n) ? n : 0;
};

const isAchieved = (item: any): boolean => item?.progressState === 'Achieved';

// 0..1 completion; achieved = full, in-progress uses the first requirement.
const progressOf = (item: any): number => {
  if (isAchieved(item)) {
    return 1;
  }
  const req = item?.progression?.requirements?.[0];
  const target = Number(req?.target);
  if (item?.progressState === 'InProgress' && target > 0) {
    return Math.max(0, Math.min(1, Number(req?.current) / target));
  }
  return 0;
};

// Per-title achievement summary + a scrollable strip, embedded in the title
// detail screen. Reuses the existing achievements API and, via "Show all",
// hands off to the full AchivementDetail screen. Renders nothing when the user
// isn't signed in (no web token) or the title has no achievements.
const TitleAchievements: React.FC<Props> = ({
  titleId,
  titleName,
  navigation,
  accent = '#3ad46b',
}) => {
  const {t} = useTranslation();
  const webToken = useSelector((state: any) => state.webToken);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<any[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'unlocked' | 'lock'>(
    'all',
  );

  React.useEffect(() => {
    if (!webToken || !titleId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFilter('all');
    const api = new WebApi(webToken);
    api
      .getAchivementDetail(String(titleId))
      .then((data: any) => {
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e: any) => {
        log.info('getAchivementDetail failed:', e);
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [webToken, titleId]);

  // Signed-out users have no achievements to show; hide the section entirely.
  if (!webToken || !titleId) {
    return null;
  }
  // Loaded but this title has none — nothing to show.
  if (!loading && items.length === 0) {
    return null;
  }

  const total = items.length;
  const unlocked = items.filter(isAchieved).length;
  const totalG = items.reduce((sum, i) => sum + gamerscoreOf(i), 0);
  const earnedG = items
    .filter(isAchieved)
    .reduce((sum, i) => sum + gamerscoreOf(i), 0);
  const pct =
    totalG > 0
      ? Math.round((earnedG / totalG) * 100)
      : total > 0
      ? Math.round((unlocked / total) * 100)
      : 0;

  const filtered =
    filter === 'unlocked'
      ? items.filter(isAchieved)
      : filter === 'lock'
      ? items.filter(i => !isAchieved(i))
      : items;
  // Cap the strip; the full list lives behind "Show all".
  const railItems = filtered.slice(0, 24);

  const goAll = () => {
    navigation.navigate('AchivementDetail', {
      name: titleName || '',
      titleId: String(titleId),
    });
  };

  const pills: Array<{key: 'all' | 'unlocked' | 'lock'; label: string}> = [
    {key: 'all', label: `${t('All')} ${total}`},
    {key: 'unlocked', label: `${t('Unlocked')} ${unlocked}`},
    {key: 'lock', label: `${t('Lock')} ${total - unlocked}`},
  ];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.secTitle}>{t('Achievements')}</Text>
        <Pressable onPress={goAll} focusable={true}>
          <Text style={[styles.showAll, {color: accent}]}>
            {t('Show all')} ›
          </Text>
        </Pressable>
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={styles.loading} color={accent} />
      ) : (
        <>
          <View style={styles.sumRow}>
            <View style={styles.gRow}>
              <Ionicons name="trophy" size={15} color="#ffc233" />
              <Text style={styles.gScore}>
                {earnedG.toLocaleString()}
                <Text style={styles.gTotal}>
                  {' '}
                  / {totalG.toLocaleString()} G
                </Text>
              </Text>
            </View>
            <Text style={[styles.pct, {color: accent}]}>{pct}%</Text>
          </View>
          <ProgressBar
            progress={pct / 100}
            color={accent}
            style={styles.track}
          />

          <View style={styles.pills}>
            {pills.map(p => {
              const on = filter === p.key;
              return (
                <Pressable
                  key={p.key}
                  focusable={true}
                  onPress={() => setFilter(p.key)}
                  style={[
                    styles.pill,
                    on && {
                      backgroundColor: 'rgba(58,212,107,0.14)',
                      borderColor: accent,
                    },
                  ]}>
                  <Text style={[styles.pillText, on && {color: '#eafff0'}]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}>
            {railItems.map((item, idx) => {
              const achieved = isAchieved(item);
              const prog = progressOf(item);
              const gs = gamerscoreOf(item);
              const icon = item?.mediaAssets?.[0]?.url;
              return (
                <View
                  key={item?.id || idx}
                  style={[styles.tile, !achieved && styles.tileLocked]}>
                  <View style={styles.iconWrap}>
                    {icon ? (
                      <Image source={{uri: icon}} style={styles.icon} />
                    ) : (
                      <View style={[styles.icon, styles.iconEmpty]} />
                    )}
                    {!achieved && (
                      <View style={styles.lockMask}>
                        <Ionicons
                          name="lock-closed"
                          size={20}
                          color="#ffffff"
                        />
                      </View>
                    )}
                  </View>
                  <Text style={styles.name} numberOfLines={2}>
                    {item?.name}
                  </Text>
                  <View style={styles.tileFoot}>
                    <Text style={styles.tileG}>{gs} G</Text>
                    <Text
                      style={[
                        styles.state,
                        achieved
                          ? {color: accent}
                          : prog > 0
                          ? {color: '#ffc233'}
                          : styles.stateLocked,
                      ]}>
                      {achieved
                        ? t('Unlocked')
                        : prog > 0
                        ? `${Math.floor(prog * 100)}%`
                        : t('Lock')}
                    </Text>
                  </View>
                  {!achieved && prog > 0 && (
                    <ProgressBar
                      progress={prog}
                      color={accent}
                      style={styles.tileBar}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  secTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#9aa2a0',
  },
  showAll: {fontSize: 12, fontWeight: '700'},
  loading: {paddingVertical: 20},
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
  gScore: {fontSize: 16, fontWeight: '700'},
  gTotal: {fontSize: 13, fontWeight: '600', color: '#9aa2a0'},
  pct: {fontSize: 18, fontWeight: '800'},
  track: {height: 7, borderRadius: 6, marginBottom: 12},
  pills: {flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap'},
  pill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {fontSize: 12, fontWeight: '600', color: '#9aa2a0'},
  rail: {gap: 10, paddingRight: 4},
  tile: {
    width: 132,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 10,
  },
  tileLocked: {opacity: 0.72},
  iconWrap: {
    width: '100%',
    height: 78,
    borderRadius: 9,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  icon: {width: '100%', height: '100%'},
  iconEmpty: {backgroundColor: 'rgba(255,255,255,0.06)'},
  lockMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {fontSize: 12, fontWeight: '600', lineHeight: 16, height: 32},
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tileG: {fontSize: 11, fontWeight: '700', color: '#ffc233'},
  state: {fontSize: 11, fontWeight: '700'},
  stateLocked: {color: '#6d7472'},
  tileBar: {height: 4, borderRadius: 3, marginTop: 6},
});

export default TitleAchievements;
