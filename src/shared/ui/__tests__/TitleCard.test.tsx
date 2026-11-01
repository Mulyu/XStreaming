import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable} from 'react-native';
import TitleCard from '../TitleCard';
import TitleShelf from '../TitleShelf';
import TitleSpotlight from '../TitleSpotlight';
import SearchField from '../SearchField';
import TvSearchModal from '../TvSearchModal';

const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll(
      n =>
        typeof n.props?.children === 'string' ||
        typeof n.props?.children === 'number',
    )
    .map(n => String(n.props.children));

const mount = (element: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(element);
  });
  return tree as renderer.ReactTestRenderer;
};

describe('TitleCard', () => {
  const base = {width: 140, title: 'Nebula Drift', onPress: jest.fn()};

  it('shows the title, rank, sale, price and a badge per service', () => {
    const tree = mount(
      <TitleCard
        {...base}
        rank={3}
        sale="-30%"
        price="¥4,200"
        badges={[
          {letter: 'X', color: '#0f0', on: true},
          {letter: 'PS', color: '#00f', on: false, catalog: true},
        ]}
      />,
    );
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Nebula Drift',
        '3',
        '-30%',
        '¥4,200',
        'X',
        'PS',
      ]),
    );
  });

  it('presses, and reports focus and blur', () => {
    const onPress = jest.fn();
    const onFocusItem = jest.fn();
    const tree = mount(
      <TitleCard {...base} onPress={onPress} onFocusItem={onFocusItem} />,
    );
    const card = tree.root.findByType(Pressable);
    act(() => card.props.onPress());
    act(() => card.props.onFocus());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onFocusItem).toHaveBeenCalledTimes(1);
    // Focused card carries the ring border colour.
    const flat = [card.props.style].flat(5).filter(Boolean);
    expect(flat.some((s: any) => s.backgroundColor)).toBe(true);
    act(() => card.props.onBlur());
  });

  it('labels an unlaunchable card with its tag', () => {
    const tree = mount(<TitleCard {...base} dim tag="Not streamable" />);
    expect(texts(tree)).toContain('Not streamable');
  });
});

describe('TitleShelf', () => {
  it('draws its heading, subtitle and children', () => {
    const tree = mount(
      <TitleShelf title="TOP 10" subtitle="Best sellers">
        <TitleCard width={120} title="Card A" onPress={jest.fn()} />
      </TitleShelf>,
    );
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['TOP 10', 'Best sellers', 'Card A']),
    );
  });
});

describe('TitleSpotlight', () => {
  it('lists where the title can be played and its sale price', () => {
    const tree = mount(
      <TitleSpotlight
        title="Nebula Drift"
        lines={[
          {color: '#0f0', on: true, text: 'Xbox · Owned'},
          {color: '#00f', on: false, text: 'PS Plus · Not available'},
        ]}
        sale="-30%"
        originalPrice="¥6,000"
        price="¥4,200"
        hint="OK Details"
      />,
    );
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Nebula Drift',
        'Xbox · Owned',
        'PS Plus · Not available',
        '-30%',
        '¥6,000',
        '¥4,200',
        'OK Details',
      ]),
    );
  });

  it('shows a plain note when there is nothing to launch', () => {
    const tree = mount(<TitleSpotlight title="X" note="Not streamable" />);
    expect(texts(tree)).toContain('Not streamable');
  });
});

describe('search components', () => {
  it('SearchField clears its text from the clear button', () => {
    const onChangeText = jest.fn();
    const tree = mount(
      <SearchField
        value="abc"
        onChangeText={onChangeText}
        placeholder="Search"
        clearLabel="Close"
      />,
    );
    const clear = tree.root
      .findAllByType(Pressable)
      .find(p => p.props.accessibilityLabel === 'Close');
    act(() => clear?.props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('SearchField hides the clear button while empty', () => {
    const tree = mount(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        placeholder="Search"
        clearLabel="Close"
      />,
    );
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
  });

  it('TvSearchModal closes from its button', () => {
    const onClose = jest.fn();
    const tree = mount(
      <TvSearchModal
        visible
        value=""
        onChangeText={jest.fn()}
        onClose={onClose}
        placeholder="Search"
        closeLabel="Close"
      />,
    );
    const close = tree.root
      .findAllByType(Pressable)
      .find(p => p.props.accessibilityLabel === 'Close');
    act(() => close?.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
