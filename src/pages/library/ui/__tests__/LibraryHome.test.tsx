import React from 'react';
import {act, create} from 'react-test-renderer';
import LibraryHome from '../LibraryHome';

jest.mock('react-native-paper', () => {
  const {Text} = require('react-native');
  return {Text, Icon: () => null};
});

const item = (key: string) =>
  ({key, title: `T-${key}`, genres: [], xcloud: {hasEntitlement: true}} as any);

const render = (shelves: any) => {
  let r: ReturnType<typeof create>;
  act(() => {
    r = create(
      <LibraryHome
        t={k => k}
        shelves={shelves}
        gamePassMap={{}}
        saleDiscount={() => 0}
        openTitle={jest.fn()}
        openTitleDetail={jest.fn()}
        refreshing={false}
        onRefresh={jest.fn()}
      />,
    );
  });
  // Only the rendered text: the tree's props hold circular elements.
  const texts: string[] = [];
  const walk = (node: any) => {
    if (typeof node === 'string') {
      texts.push(node);
    } else if (node && node.children) {
      node.children.forEach(walk);
    }
  };
  walk(r!.toJSON());
  return texts.join('|');
};

describe('LibraryHome', () => {
  it('shows the empty hint when there are no shelves', () => {
    const out = render({recent: [], favorites: [], wishSale: []});
    expect(out).toContain('LibraryHomeEmpty');
  });

  it('shows a titled shelf for each non-empty list', () => {
    const out = render({
      recent: [item('a')],
      favorites: [],
      wishSale: [item('b')],
    });
    expect(out).toContain('LibraryShelfRecent');
    expect(out).toContain('LibraryShelfWishSale');
    expect(out).not.toContain('LibraryFilterFavorite');
    expect(out).not.toContain('LibraryHomeEmpty');
    expect(out).toContain('T-a');
  });
});
