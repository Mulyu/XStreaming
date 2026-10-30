import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Animated, Pressable} from 'react-native';
import PsPlusControlRail from '../PsPlusControlRail';

jest.mock('@react-native-community/slider', () => 'Slider');

const baseProps = () =>
  ({
    t: (key: string) => key,
    screenHeight: 540,
    showControlRail: true,
    onCloseControlRail: jest.fn(),
    vibrationEnabled: true,
    onToggleVibration: jest.fn(),
    performanceVisible: false,
    onTogglePerformance: jest.fn(),
    metrics: null,
    screenPosition: 'center',
    onSetScreenPosition: jest.fn(),
    audioGain: 0.7,
    audioMuted: false,
    onToggleMute: jest.fn(),
    micOpen: false,
    onToggleMic: jest.fn(),
    onAudioGainChange: jest.fn(),
    onEditGamepadLayout: jest.fn(),
    showVirtualGamepad: true,
    onToggleVirtualGamepad: jest.fn(),
    touchpadVisible: false,
    onToggleTouchpad: jest.fn(),
    coverAvailable: false,
    coverPresented: false,
    onToggleCoverControls: jest.fn(),
    onRailDisconnect: jest.fn(),
  } as any);

const render = (props: any) => {
  let tree: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(<PsPlusControlRail {...props} />);
  });
  return tree as renderer.ReactTestRenderer;
};

const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(Pressable)
    .find(p => p.props.accessibilityLabel === label);

const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll(n => typeof n.props?.children === 'string')
    .map(n => n.props.children as string);

describe('PsPlusControlRail', () => {
  beforeEach(() => {
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
  });
  afterEach(() => jest.restoreAllMocks());

  it('has disconnect and close as icon buttons and no Nexus', () => {
    const props = baseProps();
    const tree = render(props);
    act(() => pressable(tree, 'Disconnect')?.props.onPress());
    act(() => pressable(tree, 'Close')?.props.onPress());
    expect(props.onRailDisconnect).toHaveBeenCalledTimes(1);
    expect(props.onCloseControlRail).toHaveBeenCalledTimes(1);
    expect(pressable(tree, 'Press Nexus')).toBeUndefined();
  });

  it('keeps Input / Audio / Display with the position control inside Display', () => {
    const tree = render(baseProps());
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Input', 'Audio', 'Display']),
    );
    expect(texts(tree)).not.toContain('Game screen position');
    expect(texts(tree)).not.toContain('Session');
    expect(pressable(tree, 'Top')).toBeDefined();
  });

  it('toggles gamepad, touchpad and vibration from tiles', () => {
    const props = baseProps();
    const tree = render(props);
    act(() => pressable(tree, 'Virtual gamepad')?.props.onPress());
    act(() => pressable(tree, 'Touchpad')?.props.onPress());
    act(() => pressable(tree, 'Vibration')?.props.onPress());
    expect(props.onToggleVirtualGamepad).toHaveBeenCalledTimes(1);
    expect(props.onToggleTouchpad).toHaveBeenCalledTimes(1);
    expect(props.onToggleVibration).toHaveBeenCalledTimes(1);
  });

  it('shows the microphone as a labelled button and mutes from the volume row', () => {
    const props = baseProps();
    const tree = render(props);
    expect(texts(tree)).toContain('Microphone');
    act(() => pressable(tree, 'Mute')?.props.onPress());
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('has no aspect-ratio button', () => {
    const tree = render(baseProps());
    expect(texts(tree)).not.toContain('Aspect ratio');
  });
});
