import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable} from 'react-native';
import {ChoiceRow, InfoRow, SliderRow, SwitchRow} from '../SettingRows';

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

const openRow = (tree: renderer.ReactTestRenderer) =>
  act(() => {
    tree.root.findAllByType(Pressable)[0].props.onPress();
  });

describe('settings rows', () => {
  it('a choice row lists only the title and the value, and picks from a dialog', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <ChoiceRow
        title="Resolution"
        desc="Pick the video size"
        options={[
          {value: '720p', text: '720p'},
          {value: '1080p', text: '1080p'},
        ]}
        value="720p"
        onChange={onChange}
      />,
    );
    expect(texts(tree)).toContain('Resolution');
    expect(texts(tree)).toContain('720p');
    // The description and the other options belong to the dialog.
    expect(texts(tree)).not.toContain('Pick the video size');
    expect(texts(tree)).not.toContain('1080p');
    openRow(tree);
    expect(texts(tree)).toContain('Pick the video size');
    expect(texts(tree)).toContain('1080p');
    press(tree, '1080p');
    expect(onChange).toHaveBeenCalledWith('1080p');
    // The dialog closes after a pick.
    expect(texts(tree)).not.toContain('Pick the video size');
  });

  it('a switch row is a dialog too: Enable / Disable, with the description', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <SwitchRow
        title="Vibration"
        desc="Rumble the controller"
        value={false}
        onChange={onChange}
      />,
    );
    expect(texts(tree)).toContain('Disable');
    expect(texts(tree)).not.toContain('Rumble the controller');
    // Pressing the row does not change anything by itself.
    openRow(tree);
    expect(onChange).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Rumble the controller');
    press(tree, 'Enable');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a slider row moves by its step and commits on confirm', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
      <SliderRow
        title="Bitrate"
        desc="How much data per second"
        min={4}
        max={50}
        step={1}
        value={10}
        onChange={onChange}
        formatValue={v => `${v} Mbps`}
      />,
    );
    expect(texts(tree)).toContain('10 Mbps');
    expect(texts(tree)).not.toContain('How much data per second');
    openRow(tree);
    expect(texts(tree)).toContain('How much data per second');
    press(tree, '›');
    press(tree, 'Confirm');
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('an info row shows the value and reacts to a long press only', () => {
    const onLongPress = jest.fn();
    const tree = renderer.create(
      <InfoRow title="Time left" value="12h" onLongPress={onLongPress} />,
    );
    expect(texts(tree)).toContain('12h');
    act(() => {
      tree.root.findByType(Pressable).props.onLongPress();
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);

    const plain = renderer.create(<InfoRow title="Time left" value="12h" />);
    expect(plain.root.findByType(Pressable).props.disabled).toBe(true);
  });
});
