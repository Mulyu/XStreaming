export {default as Token} from './model/base';
export type {TokenData} from './model/base';

export {default as DeviceToken} from './model/devicetoken';
export type {DeviceTokenData} from './model/devicetoken';

export {default as MsalToken} from './model/msaltoken';
export type {MsalTokenData} from './model/msaltoken';

export {default as SisuToken} from './model/sisutoken';
export type {SisuTokenData} from './model/sisutoken';

export {default as StreamingToken} from './model/streamingtoken';
export type {StreamingTokenData, StreamingRegion} from './model/streamingtoken';

export {default as UserToken} from './model/usertoken';
export type {UserTokenData} from './model/usertoken';

export {default as XstsToken} from './model/xststoken';
export type {XstsTokenData} from './model/xststoken';

export {
  saveWebToken,
  getWebToken,
  clearWebToken,
  isWebTokenValid,
} from './model/webTokenStore';

export {
  saveStreamToken,
  getStreamToken,
  clearStreamToken,
  isStreamTokenValid,
} from './model/streamTokenStore';

export {
  CONTENT_ACCESS_RELYING_PARTY,
  fetchStreamingTime,
  decodeAccountStreamingTime,
  remainingStreamingSeconds,
} from './api/contentAccess';
export type {
  StreamingGameplayTime,
  StreamingProgramData,
} from './api/contentAccess';

export {fetchXboxProfile, parseXboxProfile} from './api/profile';
export {
  getCachedXboxProfile,
  loadXboxProfile,
  clearXboxProfileCache,
} from './model/profileCache';
export {
  isXboxMembershipActive,
  membershipFromTier,
  recordXboxMembership,
} from './model/membership';
export type {XboxProfile} from './api/profile';

export {default as Xal} from './api/xal';
export {default as Msal} from './api/msal';

export type {AuthenticationMethod, TokenStoreData} from './api/tokenstore';
export {default as TokenStore} from './api/tokenstore';

export {default as MsalAuth} from './ui/MsalAuth';
