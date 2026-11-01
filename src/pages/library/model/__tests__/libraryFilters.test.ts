import {activeFilterCount, selectLibraryTab, TabState} from '../libraryFilters';

const state = (over: Partial<TabState> = {}): TabState => ({
  tab: 'all',
  ownership: 'owned',
  savedOwnership: null,
  ...over,
});

describe('selectLibraryTab', () => {
  it('does nothing for the current tab', () => {
    const s = state();
    expect(selectLibraryTab(s, 'all')).toBe(s);
  });

  it('entering the wishlist widens ownership to all and remembers it', () => {
    expect(selectLibraryTab(state({ownership: 'notOwned'}), 'wish')).toEqual({
      tab: 'wish',
      ownership: 'all',
      savedOwnership: 'notOwned',
    });
  });

  it('leaving the wishlist restores the remembered ownership', () => {
    const inWish = selectLibraryTab(state({ownership: 'notOwned'}), 'wish');
    expect(selectLibraryTab(inWish, 'fav')).toEqual({
      tab: 'fav',
      ownership: 'notOwned',
      savedOwnership: null,
    });
  });

  it('falls back to owned when nothing was remembered', () => {
    expect(
      selectLibraryTab(state({tab: 'wish', ownership: 'all'}), 'all').ownership,
    ).toBe('owned');
  });

  it('moving between non-wishlist tabs keeps ownership', () => {
    expect(selectLibraryTab(state({ownership: 'all'}), 'fav')).toEqual({
      tab: 'fav',
      ownership: 'all',
      savedOwnership: null,
    });
  });
});

describe('activeFilterCount', () => {
  const none = {
    anyProvider: false,
    ownership: 'owned' as const,
    tab: 'all' as const,
    onSale: false,
    catalog: false,
  };

  it('is zero for the defaults', () => {
    expect(activeFilterCount(none)).toBe(0);
  });

  it('counts the services as one, plus each other condition', () => {
    expect(
      activeFilterCount({
        ...none,
        anyProvider: true,
        ownership: 'notOwned',
        onSale: true,
        catalog: true,
      }),
    ).toBe(4);
  });

  it('ignores the forced ownership on the wishlist tab', () => {
    expect(activeFilterCount({...none, tab: 'wish', ownership: 'all'})).toBe(0);
  });
});
