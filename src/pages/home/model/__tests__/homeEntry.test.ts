import {decideHomeEntry} from '../homeEntry';

describe('decideHomeEntry', () => {
  it('opens the app silently on a normal not-signed-in launch', () => {
    expect(
      decideHomeEntry({hasXalUrl: false, isLogined: false, wantsLogin: false}),
    ).toBe('enterMainSilently');
  });

  it('runs the interactive flow when sign-in was requested', () => {
    expect(
      decideHomeEntry({hasXalUrl: false, isLogined: false, wantsLogin: true}),
    ).toBe('checkInteractively');
  });

  it('finishes the XAL login when returning from the Login screen', () => {
    expect(
      decideHomeEntry({hasXalUrl: true, isLogined: false, wantsLogin: false}),
    ).toBe('finishXalLogin');
  });

  // Regression: Back to exit, then reopen while the process is alive. Redux
  // still says signed in, and Home used to stay blank.
  it('opens the app when already signed in', () => {
    for (const hasXalUrl of [false, true]) {
      for (const wantsLogin of [false, true]) {
        expect(decideHomeEntry({hasXalUrl, isLogined: true, wantsLogin})).toBe(
          'enterMain',
        );
      }
    }
  });
});
