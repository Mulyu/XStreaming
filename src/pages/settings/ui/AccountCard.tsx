import React from 'react';
import {StyleSheet, View, Pressable} from 'react-native';
import {Text, Icon} from 'react-native-paper';
import {useTVFocus, tvFocusRing} from '../../../shared/ui/tvFocus';
import {alpha, palette} from '../../../shared/config/palette';

type Props = {
  // Provider colour: tints the card and fills the main button.
  color: string;
  service: string;
  signedIn: boolean;
  // The signed-in account's name; the service name stands in when unknown.
  userName?: string;
  // "Your plan" block, shown when signed in and there is something to say.
  planTitle?: string;
  planLines?: string[];
  labels: {
    signedIn: string;
    signedOut: string;
    plan: string;
    changePlan: string;
    signIn: string;
    signOut: string;
  };
  onSignIn: () => void;
  onSignOut: () => void;
  onChangePlan: () => void;
};

// The account row of a provider's settings tab: who is signed in and which
// plan they are on, with a button to the provider's own plan page.
const AccountCard: React.FC<Props> = ({
  color,
  service,
  signedIn,
  userName,
  planTitle,
  planLines,
  labels,
  onSignIn,
  onSignOut,
  onChangePlan,
}) => {
  const primaryFocus = useTVFocus();
  const secondaryFocus = useTVFocus();
  const initial = (userName || service).trim().charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: alpha(color, 0.13),
          borderColor: alpha(color, 0.33),
        },
      ]}>
      <View style={styles.head}>
        <View style={[styles.avatar, {backgroundColor: color}]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.service}>{service}</Text>
          <Text style={styles.user} numberOfLines={1}>
            {signedIn ? userName || service : labels.signedOut}
          </Text>
        </View>
        {signedIn && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{labels.signedIn}</Text>
          </View>
        )}
      </View>

      {signedIn && !!planTitle && (
        <>
          <View style={styles.divider} />
          <View style={styles.plan}>
            <Text style={styles.planLabel}>{labels.plan}</Text>
            <Text style={[styles.planTitle, {color}]}>{planTitle}</Text>
            {(planLines ?? []).map(line => (
              <Text key={line} style={styles.planLine}>
                {line}
              </Text>
            ))}
          </View>
        </>
      )}

      <View style={styles.actions}>
        {signedIn ? (
          <>
            <Pressable
              style={[
                styles.primary,
                {backgroundColor: color},
                primaryFocus.focused && tvFocusRing,
              ]}
              onPress={onChangePlan}
              onFocus={primaryFocus.onFocus}
              onBlur={primaryFocus.onBlur}
              accessibilityRole="button">
              <Text style={styles.primaryText}>{labels.changePlan}</Text>
              <Icon source="open-in-new" size={15} color={palette.onAccent} />
            </Pressable>
            <Pressable
              style={[styles.secondary, secondaryFocus.focused && tvFocusRing]}
              onPress={onSignOut}
              onFocus={secondaryFocus.onFocus}
              onBlur={secondaryFocus.onBlur}
              accessibilityRole="button">
              <Text style={styles.secondaryText}>{labels.signOut}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[
              styles.primary,
              {backgroundColor: color},
              primaryFocus.focused && tvFocusRing,
            ]}
            onPress={onSignIn}
            onFocus={primaryFocus.onFocus}
            onBlur={primaryFocus.onBlur}
            accessibilityRole="button">
            <Text style={styles.primaryText}>{labels.signIn}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  head: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 18, fontWeight: '800', color: palette.onAccent},
  headText: {flex: 1, gap: 2},
  service: {fontSize: 11.5, fontWeight: '700', color: palette.textSoft},
  user: {fontSize: 17, fontWeight: '800'},
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: alpha(palette.success, 0.18),
  },
  badgeText: {fontSize: 11, fontWeight: '800', color: palette.success},
  divider: {height: 1, backgroundColor: alpha(palette.text, 0.14)},
  plan: {gap: 4},
  planLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: palette.textSoft,
  },
  planTitle: {fontSize: 22, fontWeight: '800'},
  planLine: {fontSize: 12.5, lineHeight: 20, color: palette.text},
  actions: {flexDirection: 'row', gap: 8},
  // Constant 2px transparent border so gaining the focus ring never resizes
  // the button (tvFocusRing sets the border colour).
  primary: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  primaryText: {fontSize: 13, fontWeight: '800', color: palette.onAccent},
  secondary: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: alpha(palette.text, 0.14),
  },
  secondaryText: {fontSize: 13, fontWeight: '800', color: palette.text},
});

export default AccountCard;
