import {storage} from '../store/mmkv';

// PSN's `npsso` cookie is the only credential PS Plus cloud streaming needs
// client-side -- obtained by signing into ca.account.sony.com in a WebView
// (see pages/PsPlusLogin.tsx) and reading that cookie, the same technique
// every unofficial PSN client (chiaki-ng, psn-api, PSNAWP, ...) already uses.
// It's a long-lived session token (Sony revokes/rotates it server-side, not
// a short OAuth access token), so it's simply persisted until the user signs
// out or Sony rejects it.
const NPSSO_KEY = 'psplus.npsso';

export const getNpsso = (): string | undefined =>
  storage.getString(NPSSO_KEY) || undefined;

export const setNpsso = (npsso: string): void => {
  storage.set(NPSSO_KEY, npsso);
};

export const clearNpsso = (): void => {
  storage.delete(NPSSO_KEY);
};

export const isPsPlusSignedIn = (): boolean => !!getNpsso();
