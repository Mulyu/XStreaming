import React from 'react';
import {act, create} from 'react-test-renderer';
import LibraryFilterSheet from '../LibraryFilterSheet';

jest.mock('react-native-paper', () => {
  const {Text} = require('react-native');
  return {Text, Icon: () => null};
});

const base = {
  visible: true,
  onClose: jest.fn(),
  t: (k: string) => k,
  isTV: true,
  showServices: true,
  filterXcloud: false,
  setFilterXcloud: jest.fn(),
  filterGfn: false,
  setFilterGfn: jest.fn(),
  filterPsPlus: false,
  setFilterPsPlus: jest.fn(),
  showOwnership: true,
  ownership: 'all' as const,
  setOwnership: jest.fn(),
  filterOnSale: false,
  setFilterOnSale: jest.fn(),
  filterCatalog: false,
  toggleCatalog: jest.fn(),
  onReset: jest.fn(),
};

const labels = (props: typeof base) => {
  let r: ReturnType<typeof create>;
  act(() => {
    r = create(<LibraryFilterSheet {...props} />);
  });
  return JSON.stringify(r!.toJSON());
};

describe('LibraryFilterSheet', () => {
  it('shows services and ownership when asked', () => {
    const out = labels(base);
    expect(out).toContain('LibraryFilterXcloud');
    expect(out).toContain('LibraryFilterOwned');
  });

  it('hides services on the phone and ownership on the wishlist tab', () => {
    const out = labels({...base, showServices: false, showOwnership: false});
    expect(out).not.toContain('LibraryFilterXcloud');
    expect(out).not.toContain('LibraryFilterOwned');
    expect(out).toContain('LibraryFilterOnSale');
  });
});
