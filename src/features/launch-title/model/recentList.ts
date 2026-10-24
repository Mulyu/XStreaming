// The "recently launched" list behind the home-screen widget: pure list
// logic, kept apart from storage and the native bridge so it is testable.

export const RECENT_LAUNCH_LIMIT = 4;

// Everything the widget needs to relaunch a title directly: the exact payload
// buildShortcutRequest() produces (provider-specific ids, name, artwork URL).
export type RecentLaunch = {
  provider: string;
  titleName: string;
  iconUrl: string;
  productId?: string;
  titleId?: string;
  xCloudTitleId?: string;
  gfnAppId?: string;
  gfnStore?: string;
};

// Same title launched through a different provider/store is still the same
// game, so identity is the name, not the provider ids.
export const recentKey = (entry: {titleName: string}): string =>
  (entry.titleName || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

// Puts `entry` first, drops any earlier entry for the same game, keeps at most
// `limit`. A relaunch from a shortcut/widget carries no artwork URL, so the
// previous entry's one is kept rather than blanked.
export const pushRecent = (
  list: RecentLaunch[],
  entry: RecentLaunch,
  limit: number = RECENT_LAUNCH_LIMIT,
): RecentLaunch[] => {
  const key = recentKey(entry);
  if (!key) {
    return list;
  }
  const previous = list.find(item => recentKey(item) === key);
  const next: RecentLaunch = {
    ...entry,
    iconUrl: entry.iconUrl || previous?.iconUrl || '',
  };
  return [next, ...list.filter(item => recentKey(item) !== key)].slice(
    0,
    limit,
  );
};
