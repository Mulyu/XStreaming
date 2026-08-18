import React from 'react';
import {StyleSheet, View, Pressable} from 'react-native';
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

// Per-title achievement *summary* embedded in the title detail screen: total
// gamerscore and completion, tappable to open the full AchivementDetail list.
// The full list of achievements lives on that screen, not here. Renders nothing
// when the user isn't signed in (no web token) or the title has no achievements.
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

  React.useEffect(() => {
    if (!webToken || !titleId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    // Clear the previous title's data so its summary can't flash while the new
    // title's achievements load.
    setItems([]);
    setLoading(true);
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
  const achievedItems = items.filter(isAchieved);
  const unlocked = achievedItems.length;
  const totalG = items.reduce((sum, i) => sum + gamerscoreOf(i), 0);
  const earnedG = achievedItems.reduce((sum, i) => sum + gamerscoreOf(i), 0);
  // Raw completion ratio drives the bar; only the label is rounded, so a title
  // at 999/1000 G doesn't show a full bar.
  const ratio =
    totalG > 0 ? earnedG / totalG : total > 0 ? unlocked / total : 0;
  const pct = Math.round(ratio * 100);

  const goAll = () => {
    navigation.navigate('AchivementDetail', {
      name: titleName || '',
      titleId: String(titleId),
    });
  };

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
        <Pressable onPress={goAll} focusable={true} style={styles.entry}>
          <View style={styles.entryIcon}>
            <Ionicons name="trophy" size={20} color="#ffc233" />
          </View>
          <View style={styles.entryText}>
            <View style={styles.entryTop}>
              <Text style={styles.gScore}>
                {earnedG.toLocaleString()}
                <Text style={styles.gTotal}>
                  {' '}
                  / {totalG.toLocaleString()} G
                </Text>
              </Text>
              <Text style={[styles.pct, {color: accent}]}>{pct}%</Text>
            </View>
            <ProgressBar
              progress={ratio}
              color={accent}
              style={styles.track}
            />
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6d7472" />
        </Pressable>
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
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  entryIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,194,51,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryText: {flex: 1, minWidth: 0, gap: 7},
  entryTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  gScore: {fontSize: 16, fontWeight: '700'},
  gTotal: {fontSize: 13, fontWeight: '600', color: '#9aa2a0'},
  pct: {fontSize: 16, fontWeight: '800'},
  track: {height: 6, borderRadius: 6},
});

export default TitleAchievements;
