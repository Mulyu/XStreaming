// Pure rules for the wishlist, kept apart from the MMKV-backed store
// (wishlist.ts) so they can be unit tested directly.

// Store ids a wishlisted title is known by on each service. Saved when the
// title is added (from a Store row, the row's own id) so the title can still be
// shown and priced when the catalogs it came from aren't loaded -- or never
// contained it, as for titles that can't be streamed at all.
export type WishlistRefs = {
  xbox?: string;
  steam?: string;
  ps?: string;
};

// Display price last seen for the title; refreshed while the Library is open.
export type WishlistSnapshot = {
  price?: string;
  originalPrice?: string;
  // Whole-number percent off; 0 or absent when not on sale.
  discountPercent?: number;
};

export type WishlistEntry = {
  // Normalized title, the same key the Library catalog and favorites use.
  key: string;
  title: string;
  imageUrl?: string;
  addedAt: number;
  refs?: WishlistRefs;
  snapshot?: WishlistSnapshot;
};

export const upsertEntry = (
  list: WishlistEntry[],
  entry: WishlistEntry,
): WishlistEntry[] => {
  const index = list.findIndex(item => item.key === entry.key);
  if (index < 0) {
    return [...list, entry];
  }
  // Keep the original add time; take fresher display data and merge ids so a
  // title added from the Xbox Store keeps its id when later added from PS.
  const prev = list[index];
  const merged: WishlistEntry = {
    ...prev,
    ...entry,
    addedAt: prev.addedAt,
    imageUrl: entry.imageUrl ?? prev.imageUrl,
    refs: {...prev.refs, ...entry.refs},
    snapshot: entry.snapshot ?? prev.snapshot,
  };
  return list.map((item, i) => (i === index ? merged : item));
};

export const removeEntry = (
  list: WishlistEntry[],
  key: string,
): WishlistEntry[] => list.filter(item => item.key !== key);

// Splits a wishlist into what to keep and what has become owned (and so no
// longer belongs on it). A key that isn't in `ownedByKey` at all -- a title
// the loaded catalogs don't know -- is kept.
export const splitAcquired = (
  list: WishlistEntry[],
  ownedByKey: Map<string, boolean>,
): {kept: WishlistEntry[]; acquired: WishlistEntry[]} => {
  const kept: WishlistEntry[] = [];
  const acquired: WishlistEntry[] = [];
  list.forEach(entry => {
    (ownedByKey.get(entry.key) ? acquired : kept).push(entry);
  });
  return {kept, acquired};
};

// Favorites used to be allowed on any title; they are now owned-only. The
// favorites that aren't owned are copied (not moved) onto the wishlist once,
// so nothing is lost if ownership was only briefly unknown while catalogs
// were still loading -- such a title is dropped from the wishlist again by
// splitAcquired as soon as it shows up as owned.
export const favoritesToWishlist = (
  favoriteKeys: string[],
  wishlist: WishlistEntry[],
  lookup: Map<string, {title: string; imageUrl?: string; owned: boolean}>,
  now: number,
): WishlistEntry[] => {
  let next = wishlist;
  favoriteKeys.forEach(key => {
    const info = lookup.get(key);
    if (!info || info.owned || next.some(item => item.key === key)) {
      return;
    }
    next = [
      ...next,
      {key, title: info.title, imageUrl: info.imageUrl, addedAt: now},
    ];
  });
  return next;
};

// Whether a snapshot says the title is discounted.
export const snapshotDiscount = (entry: {
  snapshot?: WishlistSnapshot;
}): number => entry.snapshot?.discountPercent || 0;
