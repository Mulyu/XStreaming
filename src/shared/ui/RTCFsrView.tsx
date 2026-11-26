import React from 'react';
import {
  requireNativeComponent,
  StyleProp,
  ViewStyle,
  ViewProps,
} from 'react-native';

type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  // Exactly one of these identifies the video track to render. streamURL
  // looks the track up in react-native-webrtc's own MediaStream registry;
  // nativeTrackId looks it up in NativeVideoTrackHolder, for a track one of
  // this app's own native WebRTC clients (GfnNativeWebRtcClient and friends)
  // created on its own PeerConnectionFactory, outside that registry.
  streamURL?: string;
  nativeTrackId?: string;
  objectFit?: 'contain' | 'cover';
  mirror?: boolean;
  zOrder?: number;
  videoFormat?: string;
  screenPosition?: string;
  fsrEnabled?: boolean;
  fsrSharpness?: number;
};

const NativeRTCFsrVideoView = requireNativeComponent<Props>('RTCFsrVideoView');

const RTCFsrView: React.FC<Props> = props => {
  return <NativeRTCFsrVideoView {...props} />;
};

export default RTCFsrView;
