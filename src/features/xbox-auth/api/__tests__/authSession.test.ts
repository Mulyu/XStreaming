const mockSettings: {use_msal_login?: boolean} = {};
const mockGfn = {signedIn: false, refresh: jest.fn(() => Promise.resolve())};

jest.mock('../../../../shared/lib/settings', () => ({
  getSettings: () => mockSettings,
}));
jest.mock('../../../../shared/lib/debug', () => ({
  debugFactory: () => ({info: jest.fn(), error: jest.fn(), warn: jest.fn()}),
}));
jest.mock('../../../../entities/gfn-account', () => ({
  isSignedIn: () => mockGfn.signedIn,
  getValidTokens: () => mockGfn.refresh(),
}));

jest.mock('../../../../Authentication', () => {
  class MockAuth {
    completed: any;
    failed: any;
    _tokenStore = {load: jest.fn(), getAuthenticationMethod: () => 'xal'};
    checkAuthentication = jest.fn(() => Promise.resolve(true));
    constructor(completed: any, failed: any) {
      this.completed = completed;
      this.failed = failed;
    }
  }
  return {__esModule: true, default: MockAuth};
});
jest.mock('../../../../MsalAuthentication', () => {
  const Base = jest.requireMock('../../../../Authentication').default;
  class MockMsal extends Base {
    getMsalDeviceCode = jest.fn();
  }
  return {__esModule: true, default: MockMsal};
});

import store from '../../../../shared/lib/reduxStore';
import MockAuth from '../../../../Authentication';
import MockMsal from '../../../../MsalAuthentication';
import {
  ensureAuthentication,
  runSilentAuthCheck,
  setInteractiveFailureHandler,
  switchToMsalAuthentication,
} from '../authSession';

const reset = () => {
  store.dispatch({type: 'SET_AUTHENTICATION', payload: null});
  store.dispatch({type: 'SET_LOGIN', payload: false});
  store.dispatch({type: 'SET_STREAMING_TOKEN', payload: {}});
  setInteractiveFailureHandler(null);
  mockSettings.use_msal_login = false;
  mockGfn.signedIn = false;
  mockGfn.refresh.mockClear();
};

describe('xbox auth session', () => {
  beforeEach(reset);

  it('creates the authentication once and registers it in Redux', () => {
    const first = ensureAuthentication();
    expect(first).toBeInstanceOf(MockAuth);
    expect(first._tokenStore.load).toHaveBeenCalledTimes(1);
    expect(store.getState().authentication).toBe(first);
    expect(ensureAuthentication()).toBe(first);
  });

  it('uses MSAL when the setting asks for it', () => {
    mockSettings.use_msal_login = true;
    expect(ensureAuthentication()).toBeInstanceOf(MockMsal);
  });

  it('records a completed sign-in in Redux', () => {
    const auth = ensureAuthentication();
    auth.completed({xCloudToken: 'x'}, {web: 'w'});
    const state = store.getState();
    expect(state.isLogined).toBe(true);
    expect(state.streamingTokens).toEqual({xCloudToken: 'x'});
    expect(state.webToken).toEqual({web: 'w'});
  });

  it('keeps failures silent unless an interactive sign-in is waiting', () => {
    const auth = ensureAuthentication();
    const handler = jest.fn();
    expect(() => auth.failed('boom', true)).not.toThrow();
    setInteractiveFailureHandler(handler);
    auth.failed('boom', true);
    expect(handler).toHaveBeenCalledWith('boom', true);
    auth.failed('again');
    expect(handler).toHaveBeenLastCalledWith('again', false);
  });

  it('can swap to MSAL, and the swap reaches Redux', () => {
    ensureAuthentication();
    const msal = switchToMsalAuthentication();
    expect(msal).toBeInstanceOf(MockMsal);
    expect(store.getState().authentication).toBe(msal);
  });

  describe('runSilentAuthCheck', () => {
    it('checks saved xCloud tokens when not signed in', () => {
      runSilentAuthCheck();
      expect(
        store.getState().authentication.checkAuthentication,
      ).toHaveBeenCalledTimes(1);
    });

    it('skips xCloud when this process is already signed in', () => {
      const auth = ensureAuthentication();
      store.dispatch({type: 'SET_LOGIN', payload: true});
      runSilentAuthCheck();
      expect(auth.checkAuthentication).not.toHaveBeenCalled();
    });

    it('refreshes GFN only when signed in to GFN', () => {
      runSilentAuthCheck();
      expect(mockGfn.refresh).not.toHaveBeenCalled();
      mockGfn.signedIn = true;
      runSilentAuthCheck();
      expect(mockGfn.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
