jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({addListener: jest.fn()})),
}));
jest.mock('../../../../i18n', () => ({
  __esModule: true,
  default: {t: (k: string) => k},
}));

import {controllerInputEquals, gpStateToPsPlusInput} from '../streamAdapter';
import {ControllerButton} from '../native';

describe('gpStateToPsPlusInput', () => {
  it('maps Nexus to the PS button and View to the touchpad click', () => {
    expect(gpStateToPsPlusInput({Nexus: 1}).buttons).toBe(ControllerButton.PS);
    expect(gpStateToPsPlusInput({View: 1}).buttons).toBe(
      ControllerButton.TOUCHPAD,
    );
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

describe('controllerInputEquals', () => {
  it('is true for the same pad state and false once anything moves', () => {
    const a = gpStateToPsPlusInput({A: 1, LeftThumbXAxis: 0.5});
    expect(
      controllerInputEquals(
        a,
        gpStateToPsPlusInput({A: 1, LeftThumbXAxis: 0.5}),
      ),
    ).toBe(true);
    expect(
      controllerInputEquals(
        a,
        gpStateToPsPlusInput({A: 1, LeftThumbXAxis: 0.6}),
      ),
    ).toBe(false);
    expect(
      controllerInputEquals(a, gpStateToPsPlusInput({LeftThumbXAxis: 0.5})),
    ).toBe(false);
  });

  it('compares touches by id and position', () => {
    const touch = (x: number) =>
      gpStateToPsPlusInput({Touches: [{id: 1, x, y: 0.5}]});
    expect(controllerInputEquals(touch(0.2), touch(0.2))).toBe(true);
    expect(controllerInputEquals(touch(0.2), touch(0.3))).toBe(false);
    expect(controllerInputEquals(touch(0.2), gpStateToPsPlusInput({}))).toBe(
      false,
    );
  });
});
