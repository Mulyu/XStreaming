import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable} from 'react-native';
import {palette} from '../../config/palette';
import {
  TvChoiceRow,
  TvStepperRow,
  TvSwitchRow,
  TvTextRow,
} from '../TvSettingRows';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const hasText = (node: renderer.ReactTestInstance, label: string) =>
  node.findAll(n => n.props?.children === label).length > 0;

const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll(n => typeof n.props?.children === 'string')
    .map(n => n.props.children as string);

const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const target = tree.root
    .findAllByType(Pressable)
    .find(p => hasText(p, label));
  act(() => {
    target?.props.onPress();
  });
};

describe('TV settings rows', () => {
  it('a switch row toggles on press, without a dialog', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <TvSwitchRow
        title="Vibration"
        value={false}
        onChange={onChange}
        accent={palette.accent}
      />,
    );
    act(() => {
      tree.root.findByType(Pressable).props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a choice row shows the value and picks one from a dialog', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <TvChoiceRow
        title="Resolution"
        options={[
          {value: '720p', text: '720p'},
          {value: '1080p', text: '1080p'},
        ]}
        value="720p"
        onChange={onChange}
        accent={palette.accent}
      />,
    );
    expect(texts(tree)).toContain('720p');
    act(() => {
      tree.root.findByType(Pressable).props.onPress();
    });
    // The dialog lists every option.
    expect(texts(tree)).toContain('1080p');
    press(tree, '1080p');
    expect(onChange).toHaveBeenCalledWith('1080p');
  });

  it('a text row commits the typed value on confirm', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <TvTextRow
        title="Code"
        value="a"
        onChange={onChange}
        accent={palette.accent}
      />,
    );
    act(() => {
      tree.root.findByType(Pressable).props.onPress();
    });
    const input = tree.root.findByProps({value: 'a', autoFocus: true});
    act(() => {
      input.props.onChangeText(' b ');
    });
    press(tree, 'Confirm');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('a stepper row moves by its step and commits on confirm', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <TvStepperRow
        title="Bitrate"
        min={4}
        max={50}
        step={1}
        value={10}
        onChange={onChange}
        formatValue={v => `${v} Mbps`}
        accent={palette.accent}
      />,
    );
    act(() => {
      tree.root.findByType(Pressable).props.onPress();
    });
    press(tree, '›');
    press(tree, 'Confirm');
    expect(onChange).toHaveBeenCalledWith(11);
  });
});
