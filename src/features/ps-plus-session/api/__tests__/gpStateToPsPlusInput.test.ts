jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({addListener: jest.fn()})),
}));
jest.mock('../../../../i18n', () => ({
  __esModule: true,
  default: {t: (k: string) => k},
}));

import {gpStateToPsPlusInput} from '../streamAdapter';
import {ControllerButton} from '../native';

describe('gpStateToPsPlusInput', () => {
  it('maps the on-screen Nexus button to the PS button, not the touchpad', () => {
    const input = gpStateToPsPlusInput({Nexus: 1});
    expect(input.buttons).toBe(ControllerButton.PS);
  });

  it('maps the Touchpad click field to the touchpad button', () => {
    const input = gpStateToPsPlusInput({Touchpad: 1});
    expect(input.buttons).toBe(ControllerButton.TOUCHPAD);
  });

  it('converts normalized touches to touchpad pixels with stable ids', () => {
    const input = gpStateToPsPlusInput({
      Touches: [
        {id: 5, x: 0, y: 0},
        {id: 6, x: 1, y: 1},
      ],
    });
    expect(input.touches).toEqual([
      {id: 5, x: 0, y: 0},
      {id: 6, x: 1919, y: 941},
    ]);
  });

  it('clamps out-of-range touches, caps at two fingers, wraps ids to 7 bits', () => {
    const input = gpStateToPsPlusInput({
      Touches: [
        {id: 130, x: -1, y: 2},
        {id: 1, x: 0.5, y: 0.5},
        {id: 2, x: 0.5, y: 0.5},
      ],
    });
    expect(input.touches).toHaveLength(2);
    expect(input.touches![0]).toEqual({id: 2, x: 0, y: 941});
  });

  it('has no touches when none are down', () => {
    expect(gpStateToPsPlusInput({}).touches).toEqual([]);
  });
});
