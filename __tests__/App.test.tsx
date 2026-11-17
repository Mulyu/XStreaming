/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../src/App';

// Note: import explicitly to use the types shiped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer, {act} from 'react-test-renderer';

it('renders correctly', () => {
  // Rendered without an explicit unmount, a react-native-paper Dialog's
  // close animation can still be in flight (its .start() callback fires on
  // a real setTimeout) when the test function returns and Jest tears the
  // environment down -- the callback then throws trying to reach torn-down
  // RN globals, crashing the whole worker process rather than just this
  // test. Unmounting inside act() lets everything settle before that happens.
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<App />);
  });
  act(() => {
    tree!.unmount();
  });
});
