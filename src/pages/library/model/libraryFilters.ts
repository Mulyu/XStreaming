// Pure rules behind the Library's view tabs and the "Filter" sheet, pulled
// out of useLibraryScreen so they can be unit tested.

export type OwnershipFilter = 'owned' | 'notOwned' | 'all';
export type LibraryTab = 'home' | 'all' | 'fav' | 'wish';

export type TabState = {
  tab: LibraryTab;
  ownership: OwnershipFilter;
  // The ownership filter to put back when leaving the wishlist tab.
  savedOwnership: OwnershipFilter | null;
};

// The wishlist is by definition titles that aren't owned, so entering that
// tab widens the ownership filter to "all" (remembering what it was), and
// leaving it puts the previous setting back.
export const selectLibraryTab = (
  state: TabState,
  next: LibraryTab,
): TabState => {
  if (next === state.tab) {
    return state;
  }
  if (next === 'wish') {
    return {tab: next, ownership: 'all', savedOwnership: state.ownership};
  }
  if (state.tab === 'wish') {
    return {
      tab: next,
      ownership: state.savedOwnership ?? 'owned',
      savedOwnership: null,
    };
  }
  return {...state, tab: next};
};

// How many filter conditions differ from the defaults (any service picked;
// ownership other than "owned"; on sale; included in a catalog) -- the badge
// on the Filter button. Ownership does not count on the wishlist tab, where
// it is forced to "all".
export const activeFilterCount = (opts: {
  anyProvider: boolean;
  ownership: OwnershipFilter;
  tab: LibraryTab;
  onSale: boolean;
  catalog: boolean;
}): number =>
  (opts.anyProvider ? 1 : 0) +
  (opts.ownership !== 'owned' && opts.tab !== 'wish' ? 1 : 0) +
  (opts.onSale ? 1 : 0) +
  (opts.catalog ? 1 : 0);
