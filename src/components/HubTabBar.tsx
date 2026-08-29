import React from 'react';
import {View, Pressable, StyleSheet} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';

const ACCENT = '#2FD24B';

// Meta for each tab route, keyed by the route name registered in the bottom-tab
// navigator. Keeping this here (not in the navigator) lets the bar stay a pure
// presentational component driven by the navigation state.
const TAB_META: Record<string, {labelKey: string; icon: string}> = {
  Cloud: {labelKey: 'Library', icon: 'view-grid'},
  Discovery: {labelKey: 'Discovery', icon: 'cards'},
  Settings: {labelKey: 'Settings', icon: 'cog'},
};

// Custom tabBar for the bottom-tab navigator. It renders once and persists
// across tab switches — only the screen content above it changes — so switching
// Library / Discovery / Settings no longer transitions the whole screen.
function HubTabBar({state, navigation}: any) {
  const {t} = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
          paddingBottom: 9 + insets.bottom,
        },
      ]}>
      {state.routes.map((route: any, index: number) => {
        const meta = TAB_META[route.name];
        if (!meta) {
          return null;
        }
        const isActive = state.index === index;
        const color = isActive ? ACCENT : inactiveColor;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            android_ripple={{color: 'rgba(150,150,150,0.15)', borderless: true}}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={isActive ? {selected: true} : {}}
            accessibilityLabel={t(meta.labelKey)}>
            <Icon
              source={isActive ? meta.icon : `${meta.icon}-outline`}
              size={22}
              color={color}
            />
            <Text style={[styles.label, {color}]}>{t(meta.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
