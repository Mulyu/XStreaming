import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  DeviceEventEmitter,
  Platform,
} from 'react-native';
import {Text, Icon, useTheme} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {TV_FOCUS_COLOR} from '../../../shared/ui/tvFocus';
import {alpha, palette} from '../../../shared/config/palette';

const ACCENT = palette.accent;

// Width of the TV rail (see render() below) -- exported so the app layer can
// reserve this much left padding on the tab screens it wraps, since the rail
// renders as an overlay rather than a normal flex sibling (its own comment
// below explains why).
export const TV_RAIL_WIDTH = 72;

// Meta for each tab route, keyed by the route name registered in the bottom-tab
// navigator. Keeping this here (not in the navigator) lets the bar stay a pure
// presentational component driven by the navigation state.
const TAB_META: Record<string, {labelKey: string; icon: string}> = {
  Library: {labelKey: 'Library', icon: 'view-grid'},
  Store: {labelKey: 'Store', icon: 'cart'},
  Settings: {labelKey: 'Settings', icon: 'cog'},
};

// Custom tabBar for the bottom-tab navigator. It renders once and persists
// across tab switches — only the screen content above it changes — so switching
// Library / Settings no longer transitions the whole screen.
//
// On Google TV this renders as a persistent left-edge rail instead of a
// bottom bar (reachable with a single D-pad Left from anywhere, unlike a
// bottom bar a few rows away -- see MainActivity.java's own
// armDpadDownLongPress, the band-aid this replaces as the primary way in).
// react-navigation's BottomTabView always stacks its tabBar slot *below* the
// screen area in a column (there's no prop to turn that into a row), so the
// rail can't be a normal flex sibling there -- it has to escape that slot
// with position:absolute and overlay the content instead (every screen
// BottomTabView renders is itself position:absolute/full-bleed already, see
// its own MaybeScreen usage, so this doesn't fight anything). The one thing
// this requires from the app layer: reserve TV_RAIL_WIDTH of left padding on
// the tab screens so the rail doesn't sit on top of their content (done once,
// in App.tsx's withTabScreen).
function HubTabBar({state, navigation}: any) {
  const {t} = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inactiveColor = theme.dark ? palette.textSoft : palette.textDim;
  // Only a handful of tabs ever render -- a focused-key is simpler here than
  // extracting a per-tab sub-component (see tvFocus.ts's own doc comment).
  const [focusedKey, setFocusedKey] = React.useState<string | null>(null);
  const tabRefs = React.useRef<Record<string, any>>({});

  // Holding D-pad Down on a non-streaming screen (Library/Store/Settings)
  // jumps focus straight here instead of requiring one Down-press per row of
  // whatever's above (see MainActivity.java's armDpadDownLongPress -- this
  // bar is the one thing that persists across those screens, so it's the
  // natural place for the single listener). Lands on the currently active
  // tab, not always the first one, so a repeat press naturally continues
  // wherever the user already was. Kept for the rail too (a physical
  // controller's D-pad Down is still a valid way in, even though the rail
  // itself is also one D-pad Left away from anywhere).
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onDpadDownLongPress', () => {
      const activeRoute = state.routes[state.index];
      const ref = activeRoute && tabRefs.current[activeRoute.key];
      ref?.focus?.();
    });
    return () => sub.remove();
  }, [state]);

  const tabs = state.routes
    .map((route: any, index: number) => ({
      route,
      index,
      meta: TAB_META[route.name],
    }))
    .filter((entry: any) => !!entry.meta);

  const makeOnPress = (route: any, isActive: boolean) => () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isActive && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  if (Platform.isTV) {
    return (
      <View
        style={[
          styles.rail,
          {
            backgroundColor:
              theme.colors.elevation?.level2 || theme.colors.surface,
            borderRightColor:
              theme.colors.outlineVariant || alpha(palette.text, 0.2),
            paddingTop: 22 + insets.top,
            paddingBottom: 16 + insets.bottom,
          },
        ]}>
        {tabs.map(({route, index, meta}: any) => {
          const isActive = state.index === index;
          const isFocused = focusedKey === route.key;
          const color = isActive ? ACCENT : inactiveColor;
          const icon = isActive ? meta.icon : `${meta.icon}-outline`;

          return (
            <Pressable
              key={route.key}
              ref={r => {
                tabRefs.current[route.key] = r;
              }}
              onPress={makeOnPress(route, isActive)}
              onFocus={() => setFocusedKey(route.key)}
              onBlur={() =>
                setFocusedKey(prev => (prev === route.key ? null : prev))
              }
              android_ripple={{
                color: alpha(palette.text, 0.15),
                borderless: true,
              }}
              style={styles.railTab}
              accessibilityRole="button"
              accessibilityState={isActive ? {selected: true} : {}}
              accessibilityLabel={t(meta.labelKey)}>
              {isActive && !isFocused && (
                <View style={styles.railActiveIndicator} />
              )}
              {isFocused ? (
                <View style={styles.railFocusPill} pointerEvents="none">
                  <Icon source={icon} size={18} color={TV_FOCUS_COLOR} />
                  <Text style={styles.railFocusLabel}>{t(meta.labelKey)}</Text>
                </View>
              ) : (
                <Icon source={icon} size={22} color={color} />
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor:
            theme.colors.elevation?.level2 || theme.colors.surface,
          borderTopColor:
            theme.colors.outlineVariant || alpha(palette.text, 0.2),
          paddingBottom: 9 + insets.bottom,
        },
      ]}>
      {tabs.map(({route, index, meta}: any) => {
        const isActive = state.index === index;
        const color = isActive ? ACCENT : inactiveColor;

        return (
          <Pressable
            key={route.key}
            ref={r => {
              tabRefs.current[route.key] = r;
            }}
            onPress={makeOnPress(route, isActive)}
            onFocus={() => setFocusedKey(route.key)}
            onBlur={() =>
              setFocusedKey(prev => (prev === route.key ? null : prev))
            }
            android_ripple={{
              color: alpha(palette.text, 0.15),
              borderless: true,
            }}
            style={[styles.tab, focusedKey === route.key && styles.tabFocused]}
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
    paddingVertical: 4,
    marginHorizontal: 3,
    borderRadius: 12,
    // Constant width (transparent, not absent) so gaining the focus ring
    // never shifts this tab's size the way adding a border from nothing
    // would.
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // A ring alone read as weak here next to the game grid's border+scale+glow
  // treatment -- see Google TV's focus-system guide's Color indication
  // (background/content color shift), combined with the existing outline,
  // the same way this app's own filterChipOn/sortChipOn already shift a
  // chip's background to show "selected".
  tabFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: alpha(palette.focusRing, 0.14),
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // The rail itself escapes BottomTabView's column layout (see the
  // function's own comment) so it can span the full height at the screen's
  // left edge instead of taking a slice out of the bottom.
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: TV_RAIL_WIDTH,
    alignItems: 'center',
    gap: 28,
    borderRightWidth: 1,
    zIndex: 20,
  },
  railTab: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railActiveIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -9,
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  // Pops out past the rail's own width over the content below it (no
  // overflow:hidden on `rail` above, so this isn't clipped) -- same Outline +
  // Color indication as the phone bar's tabFocused, just as a pill instead of
  // a ring so the label has room without widening the rail itself.
  railFocusPill: {
    position: 'absolute',
    left: 8,
    top: '50%',
    marginTop: -17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: alpha(palette.focusRing, 0.16),
    borderWidth: 2,
    borderColor: TV_FOCUS_COLOR,
  },
  railFocusLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: TV_FOCUS_COLOR,
    letterSpacing: 0.2,
  },
});

export default HubTabBar;
