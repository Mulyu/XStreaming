import {parseXboxProfile} from '../profile';

describe('parseXboxProfile', () => {
  it('reads the gamertag and account tier from the settings list', () => {
    expect(
      parseXboxProfile({
        profileUsers: [
          {
            settings: [
              {id: 'Gamertag', value: 'SomeTag'},
              {id: 'AccountTier', value: 'Gold'},
            ],
          },
        ],
      }),
    ).toEqual({gamertag: 'SomeTag', accountTier: 'Gold'});
  });

  it('returns null for an unexpected shape or empty values', () => {
    expect(parseXboxProfile(null)).toBeNull();
    expect(parseXboxProfile({profileUsers: []})).toBeNull();
    expect(
      parseXboxProfile({
        profileUsers: [{settings: [{id: 'Gamertag', value: ''}]}],
      }),
    ).toBeNull();
  });
});
