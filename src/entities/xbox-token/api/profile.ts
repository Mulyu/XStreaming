import axios from 'axios';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('xboxProfile');

export type XboxProfile = {
  gamertag?: string;
  // Xbox's AccountTier setting: 'Gold' for an account with a Game Pass (or
  // legacy Gold) membership, 'Silver' for a free account.
  accountTier?: string;
};

// Reads the signed-in user's profile settings with the web (xboxlive.com)
// XSTS token the app already keeps (see webTokenStore). This endpoint is
// reverse-engineered rather than documented, so every failure -- no/expired
// token, offline, a changed response -- simply resolves to null and the caller
// shows nothing extra.
export const parseXboxProfile = (data: any): XboxProfile | null => {
  const settings = data?.profileUsers?.[0]?.settings;
  if (!Array.isArray(settings)) {
    return null;
  }
  const value = (id: string): string | undefined => {
    const found = settings.find((item: any) => item?.id === id);
    return typeof found?.value === 'string' && found.value
      ? found.value
      : undefined;
  };
  const profile = {
    gamertag: value('Gamertag'),
    accountTier: value('AccountTier'),
  };
  return profile.gamertag || profile.accountTier ? profile : null;
};

export const fetchXboxProfile = async (
  webToken: any,
): Promise<XboxProfile | null> => {
  const token = webToken?.data?.Token;
  const uhs = webToken?.data?.DisplayClaims?.xui?.[0]?.uhs;
  if (!token || !uhs) {
    return null;
  }
  try {
    const res = await axios.get(
      'https://profile.xboxlive.com/users/me/profile/settings',
      {
        params: {settings: 'Gamertag,AccountTier'},
        headers: {
          Authorization: `XBL3.0 x=${uhs};${token}`,
          'x-xbl-contract-version': '3',
          Accept: 'application/json',
        },
        timeout: 15000,
      },
    );
    return parseXboxProfile(res.data);
  } catch (e) {
    log.info('fetchXboxProfile failed:', e);
    return null;
  }
};
