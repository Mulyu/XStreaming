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
    psDatacenterOptions: [],
    xboxAccount: {userName: undefined, planTitle: undefined},
    gfnAccount: {userName: undefined, planTitle: undefined},
    psAccount: {userName: undefined},
    gfnPlaytimeDescription: '',
    gfnQueueDescription: '',
    xboxPlaytimeDescription: '',
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

const longPress = (tree: renderer.ReactTestRenderer, title: string) => {
  const target = tree.root
    .findAllByType(Pressable)
    .find(p => p.findAll(n => n.props?.children === title).length > 0);
  act(() => target?.props.onLongPress());
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
    press(tree, 'XboxAccountTitle');
    expect(onXcloudAccountPress).toHaveBeenCalledTimes(1);
    // The card's plan block and buttons are gone.
    expect(texts(tree)).not.toContain('AccountChangePlan');
    expect(texts(tree)).not.toContain('AccountPlan');
  });

  it('Xbox signed out: says how to sign in, with no playtime row', () => {
    const tree = render({lane: 'xbox', isAuthed: false});
    expect(texts(tree)).toContain('XcloudAccountSignedOutDesc');
    expect(texts(tree)).not.toContain('XboxPlaytimeTitle');
  });

  it('Xbox signed in: the remaining cloud gaming time on its own row', () => {
    const tree = render({
      lane: 'xbox',
      isAuthed: true,
      xboxPlaytimeDescription: '10h 30m left',
    });
    expect(texts(tree)).toContain('XboxPlaytimeTitle');
    expect(texts(tree)).toContain('10h 30m left');
  });

  it('Xbox signed in: holding the cloud gaming time row copies the content-access Authorization', () => {
    const onCopyContentAccessAuth = jest.fn();
    const tree = render({
      lane: 'xbox',
      isAuthed: true,
      xboxPlaytimeDescription: '広告つき 無制限',
      onCopyContentAccessAuth,
    });
    longPress(tree, 'XboxPlaytimeTitle');
    expect(onCopyContentAccessAuth).toHaveBeenCalledTimes(1);
    // The temporary Debug row for it is gone.
    expect(texts(tree)).not.toContain('XboxCopyContentAccessAuthTitle');
  });

  it('GeForce NOW: user name and plan on the row, playtime on its own row', () => {
    const onGfnAccountPress = jest.fn();
    const tree = render({
      lane: 'gfn',
      gfnSignedIn: true,
      gfnAccount: {userName: 'gamer', planTitle: 'Performance'},
      gfnPlaytimeDescription: '12h 30m left',
      gfnQueueDescription: '78 waiting',
      onGfnAccountPress,
    });
    expect(texts(tree)).toContain('Current user: gamer · Performance');
    expect(texts(tree)).toContain('GfnPlaytimeTitle');
    expect(texts(tree)).toContain('12h 30m left');
    expect(texts(tree)).toContain('GfnQueueTitle');
    expect(texts(tree)).toContain('78 waiting');
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

describe('copying a provider token', () => {
  it("holding each account row copies that provider's token", () => {
    const onCopyXboxToken = jest.fn();
    longPress(
      render({lane: 'xbox', isAuthed: true, onCopyXboxToken}),
      'XboxAccountTitle',
    );
    expect(onCopyXboxToken).toHaveBeenCalledTimes(1);

    const onCopyGfnToken = jest.fn();
    longPress(
      render({lane: 'gfn', gfnSignedIn: true, onCopyGfnToken}),
      'GfnAccountTitle',
    );
    expect(onCopyGfnToken).toHaveBeenCalledTimes(1);

    const onCopyPsPlusToken = jest.fn();
    longPress(
      render({lane: 'psplus', psPlusSignedIn: true, onCopyPsPlusToken}),
      'PsPlusAccountTitle',
    );
    expect(onCopyPsPlusToken).toHaveBeenCalledTimes(1);
  });

  it('the provider debug rows are gone', () => {
    for (const lane of ['gfn', 'psplus']) {
      const out = texts(
        render({lane, gfnSignedIn: true, psPlusSignedIn: true}),
      );
      expect(out).not.toContain('SectionDebug');
      expect(out.join('|')).not.toMatch(/DebugInfo|AccountInfo/);
    }
  });

  it('the retired settings are gone from the list', () => {
    // 更新履歴 / アプリのログ (common), DualSense / 認証コードログイン / 縦向きモード (Xbox).
    const lanes = ['common', 'xbox'];
    const all = lanes
      .map(lane => texts(render({lane, isAuthed: true})).join('|'))
      .join('|');
    expect(all).not.toMatch(/HistoryTitle|AppCopyDebugInfo|SectionDebug/);
    expect(all).not.toMatch(/DualSense|SectionControllers/);
    expect(all).not.toMatch(/useMsalLogin|Native portrait mode/);
  });
});
