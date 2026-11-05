import {buildDatacenterOptions, parseDatacenters} from '../datacenters';

const row = (dataCenter: string, rtt: number, measured: boolean) => ({
  dataCenter,
  rtt,
  measured,
});

describe('parseDatacenters', () => {
  it('lists measured servers fastest first, then the unmeasured ones by name', () => {
    const json = JSON.stringify([
      row('Zeta', 0, false),
      row('Slow', 90, true),
      row('Alpha', 0, false),
      row('Fast', 12.4, true),
    ]);
    expect(parseDatacenters(json)).toEqual([
      {name: 'Fast', rttMs: 12},
      {name: 'Slow', rttMs: 90},
      {name: 'Alpha', rttMs: null},
      {name: 'Zeta', rttMs: null},
    ]);
  });

  it('drops duplicates, nameless rows and anything that is not a list', () => {
    expect(
      parseDatacenters(
        JSON.stringify([row('A', 10, true), row('A', 5, true), {rtt: 3}]),
      ),
    ).toEqual([{name: 'A', rttMs: 10}]);
    expect(parseDatacenters('')).toEqual([]);
    expect(parseDatacenters(undefined)).toEqual([]);
    expect(parseDatacenters('not json')).toEqual([]);
    expect(parseDatacenters('{"a":1}')).toEqual([]);
  });
});

describe('buildDatacenterOptions', () => {
  const json = JSON.stringify([row('Tokyo', 18, true), row('Osaka', 0, false)]);

  it('offers Auto first, then each server with its response time', () => {
    expect(buildDatacenterOptions(json, '', 'Auto')).toEqual([
      {value: '', text: 'Auto'},
      {value: 'Tokyo', text: 'Tokyo · 18 ms'},
      {value: 'Osaka', text: 'Osaka'},
    ]);
  });

  it('shows only Auto before any attempt has produced a list', () => {
    expect(buildDatacenterOptions('', '', 'Auto')).toEqual([
      {value: '', text: 'Auto'},
    ]);
  });

  it('keeps a chosen server that is missing from the list selectable', () => {
    const options = buildDatacenterOptions(json, 'Frankfurt', 'Auto');
    expect(options[options.length - 1]).toEqual({
      value: 'Frankfurt',
      text: 'Frankfurt',
    });
  });
});
