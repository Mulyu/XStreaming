import React from 'react';
import {View, Pressable, StyleSheet} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

type TabKey = 'home' | 'library' | 'discovery' | 'settings';

type Props = {
  active: TabKey;
  navigation: any;
};

const ACCENT = '#2FD24B';

// Persistent bottom navigation for the four hub screens. Each tab navigates by
// route name on the existing stack — navigating to a screen already in the
// stack returns to it, so the stack stays shallow instead of growing per tap.
const HubTabBar: React.FC<Props> = ({active, navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  const tabs: {
    key: TabKey;
    route: string;
    label: string;
    icon: string;
  }[] = [
    {key: 'home', route: 'Dashboard', label: t('Home'), icon: 'home'},
    {key: 'library', route: 'Cloud', label: t('Library'), icon: 'view-grid'},
    {
      key: 'discovery',
      route: 'Discovery',
      label: t('Discovery'),
      icon: 'cards',
    },
    {key: 'settings', route: 'Settings', label: t('Settings'), icon: 'cog'},
  ];

  const inactiveColor = theme.dark ? '#8A9A92' : '#6b7770';

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor:
            theme.colors.elevation?.level2 || theme.colors.surface,
          borderTopColor:
            theme.colors.outlineVariant || 'rgba(120,180,140,0.2)',
        },
      ]}>
      {tabs.map(tab => {
        const isActive = tab.key === active;
        const color = isActive ? ACCENT : inactiveColor;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!isActive) {
                navigation.navigate(tab.route);
              }
            }}
            android_ripple={{color: 'rgba(150,150,150,0.15)', borderless: true}}
            style={styles.tab}
            accessibilityLabel={tab.label}>
            <Icon
              source={isActive ? tab.icon : `${tab.icon}-outline`}
              size={22}
              color={color}
            />
            <Text style={[styles.label, {color}]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 7,
    paddingBottom: 9,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default HubTabBar;
