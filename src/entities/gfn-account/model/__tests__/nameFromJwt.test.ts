jest.mock('../../../../shared/lib/mmkv', () => ({
  storage: {getString: () => undefined, set: () => {}, delete: () => {}},
}));

import {nameFromJwt} from '../auth';

const jwt = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}.s`;

describe('nameFromJwt', () => {
  it('prefers preferred_username', () => {
    expect(
      nameFromJwt(jwt({preferred_username: 'player', email: 'a@b.c'})),
    ).toBe('player');
  });

  it('falls back to the part of the email before the @', () => {
    expect(nameFromJwt(jwt({email: 'someone@example.com'}))).toBe('someone');
  });

  it('is null without either claim or on a malformed token', () => {
    expect(nameFromJwt(jwt({sub: '1'}))).toBeNull();
    expect(nameFromJwt('nonsense')).toBeNull();
    expect(nameFromJwt(undefined)).toBeNull();
  });
});
