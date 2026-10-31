import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable} from 'react-native';
import SettingsView from '../SettingsView';
import {getSettings} from '../../../../shared/lib/settings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../../../entities/gfn-account', () => ({
  GfnSignInModal: () => null,
}));
jest.mock('../../../../entities/xbox-token', () => ({MsalAuth: () => null}));
jest.mock('../../../../shared/ui/Spinner', () => () => null);
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');
// The real model pulls in native modules (clipboard, restart, cookies).
jest.mock('../../model/useSettingsScreen', () => ({
  M: (name: string) => ({name, title: name, description: name, data: []}),
}));
jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {getString: () => undefined, set: jest.fn()},
}));
jest.mock('../../../../shared/lib/locale', () => ({
  getSystemLocale: () => 'en-US',
}));

// Every prop the view reads: values for the data, a spy for each callback.
const makeProps = (overrides: Record<string, unknown>) => {
  const values: Record<string, unknown> = {
    t: (key: string) => key,
    loading: false,
    xcloudLoginLoading: false,
    xcloudLoginText: '',
    msalData: null,
    lane: 'xbox',
    settings: getSettings(),
    gfnSignedIn: false,
    psPlusSignedIn: false,
    gfnLoginVisible: false,
    isAuthed: false,
    signalingCloudOptions: [],
    signalingCloudValue: '',
    gfnRegionOptions: [],
    xboxAccount: {userName: undefined, planTitle: undefined},
    gfnAccount: {userName: undefined, planTitle: undefined},
    psAccount: {userName: undefined},
    gfnPlaytimeDescription: '',
    ...overrides,
  };
  return new Proxy(values, {
    get: (target, key: string) => {
      if (!(key in target)) {
        target[key] = jest.fn();
      }
      return target[key];
    },
  });
};

const render = (overrides: Record<string, unknown>) => {
  let tree: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(<SettingsView {...(makeProps(overrides) as any)} />);
  });
  return tree as renderer.ReactTestRenderer;
};

const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll(n => typeof n.props?.children === 'string')
    .map(n => n.props.children as string);

const press = (tree: renderer.ReactTestRenderer, title: string) => {
  const target = tree.root
    .findAllByType(Pressable)
    .find(p => p.findAll(n => n.props?.children === title).length > 0);
  act(() => target?.props.onPress());
};

describe('provider account rows', () => {
  it('Xbox: a plain row with the user name; tapping signs in or out', () => {
    const onXcloudAccountPress = jest.fn();
    const tree = render({
      lane: 'xbox',
      isAuthed: true,
      xboxAccount: {userName: 'player1', planTitle: 'XboxGamePassActive'},
      onXcloudAccountPress,
    });
    expect(texts(tree)).toContain('Current user: player1 · XboxGamePassActive');
    press(tree, 'XcloudAccountTitle');
    expect(onXcloudAccountPress).toHaveBeenCalledTimes(1);
    // The card's plan block and buttons are gone.
    expect(texts(tree)).not.toContain('AccountChangePlan');
    expect(texts(tree)).not.toContain('AccountPlan');
  });

  it('Xbox signed out: says how to sign in', () => {
    const tree = render({lane: 'xbox', isAuthed: false});
    expect(texts(tree)).toContain('XcloudAccountSignedOutDesc');
  });

  it('GeForce NOW: user name and plan on the row, playtime on its own row', () => {
    const onGfnAccountPress = jest.fn();
    const tree = render({
      lane: 'gfn',
      gfnSignedIn: true,
      gfnAccount: {userName: 'gamer', planTitle: 'Performance'},
      gfnPlaytimeDescription: '12h 30m left',
      onGfnAccountPress,
    });
    expect(texts(tree)).toContain('Current user: gamer · Performance');
    expect(texts(tree)).toContain('GfnPlaytimeTitle');
    expect(texts(tree)).toContain('12h 30m left');
    press(tree, 'GfnAccountTitle');
    expect(onGfnAccountPress).toHaveBeenCalledTimes(1);
  });

  it('GeForce NOW signed in without a known name: just says signed in', () => {
    const tree = render({lane: 'gfn', gfnSignedIn: true});
    expect(texts(tree)).toContain('GfnSignedIn');
  });

  it('PlayStation: the online ID on the row', () => {
    const onPsPlusAccountPress = jest.fn();
    const tree = render({
      lane: 'psplus',
      psPlusSignedIn: true,
      psAccount: {userName: 'psfan'},
      onPsPlusAccountPress,
    });
    expect(texts(tree)).toContain('Current user: psfan');
    press(tree, 'PsPlusAccountTitle');
    expect(onPsPlusAccountPress).toHaveBeenCalledTimes(1);
  });
});
