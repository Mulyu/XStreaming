import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Animated, Pressable} from 'react-native';
import StreamControlRail, {StreamControlRailProps} from '../StreamControlRail';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('@react-native-community/slider', () => 'Slider');

const baseProps = (): StreamControlRailProps => ({
  visible: true,
  onClose: jest.fn(),
  screenHeight: 540,
  streamType: 'gfn',
  connected: true,
  inputMode: 'gamepad',
  onSetInputMode: jest.fn(),
  showMouseOption: true,
  showEditGamepadLayout: true,
  onEditGamepadLayout: jest.fn(),
  showMouseSensitivity: false,
  mouseSensitivity: 1.4,
  onMouseSensitivityChange: jest.fn(),
  vibrationEnabled: true,
  onToggleVibration: jest.fn(),
  showKeyboardOption: false,
  keyboardVisible: false,
  onToggleKeyboard: jest.fn(),
  showMicrophone: true,
  microphoneOpen: false,
  onToggleMicrophone: jest.fn(),
  volume: 0.7,
  onVolumeChange: jest.fn(),
  muted: false,
  onToggleMute: jest.fn(),
  performanceVisible: false,
  onTogglePerformance: jest.fn(),
  showCoverControls: false,
  coverPresented: false,
  onToggleCoverControls: jest.fn(),
  screenPosition: 'center',
  onSetScreenPosition: jest.fn(),
  onPressNexus: jest.fn(),
  onDisconnect: jest.fn(),
});

const render = (props: StreamControlRailProps) => {
  let tree: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(<StreamControlRail {...props} />);
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

describe('StreamControlRail', () => {
  beforeEach(() => {
    // The slide-in animation ticks on a timer outside act(); skip it.
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
  });
  afterEach(() => jest.restoreAllMocks());

  it('puts Nexus, disconnect and close in the top row as icon buttons', () => {
    const props = baseProps();
    const tree = render(props);
    act(() => pressable(tree, 'Press Nexus')?.props.onPress());
    act(() => pressable(tree, 'Disconnect')?.props.onPress());
    act(() => pressable(tree, 'Close')?.props.onPress());
    expect(props.onPressNexus).toHaveBeenCalledTimes(1);
    expect(props.onDisconnect).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // Icon buttons carry no visible text.
    expect(texts(tree)).not.toContain('Press Nexus');
    expect(texts(tree)).not.toContain('Disconnect');
  });

  it('keeps the Input / Audio / Display section headings', () => {
    const tree = render(baseProps());
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Input', 'Audio', 'Display']),
    );
    expect(texts(tree)).not.toContain('Game screen position');
    expect(texts(tree)).not.toContain('Session');
  });

  it('shows the microphone as a labelled button and mutes from the volume row', () => {
    const props = baseProps();
    const tree = render(props);
    expect(texts(tree)).toContain('Microphone');
    act(() => pressable(tree, 'Mute')?.props.onPress());
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('no longer offers FSR or the aspect-ratio button', () => {
    const tree = render(baseProps());
    expect(pressable(tree, 'FSR')).toBeUndefined();
    expect(texts(tree)).not.toContain('FSR');
    expect(texts(tree)).not.toContain('Aspect ratio');
  });

  it('shows the name of the focused tile beside its section heading', () => {
    const tree = render(baseProps());
    const vibration = pressable(tree, 'Vibration');
    expect(texts(tree)).not.toContain('Vibration');
    act(() => vibration?.props.onFocus());
    expect(texts(tree)).toContain('Vibration');
    act(() => vibration?.props.onBlur());
    expect(texts(tree)).not.toContain('Vibration');
  });

  it('while connecting shows only disconnect and close', () => {
    const tree = render({...baseProps(), connected: false});
    expect(pressable(tree, 'Press Nexus')).toBeUndefined();
    expect(pressable(tree, 'Disconnect')).toBeDefined();
    expect(pressable(tree, 'Close')).toBeDefined();
    expect(texts(tree)).not.toContain('Input');
  });

  it('offers the edit button only for the virtual gamepad, the keyboard tile only when asked', () => {
    const props = {...baseProps(), showEditGamepadLayout: false};
    const tree = render(props);
    expect(pressable(tree, 'Edit layout')).toBeUndefined();
    expect(pressable(tree, 'Keyboard')).toBeUndefined();
    const withKeyboard = render({...baseProps(), showKeyboardOption: true});
    expect(pressable(withKeyboard, 'Keyboard')).toBeDefined();
  });
});
