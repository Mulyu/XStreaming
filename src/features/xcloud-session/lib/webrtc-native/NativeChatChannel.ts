import {NativeModules} from 'react-native';
import BaseChannel from '../webrtc/Channel/Base';

const {XcloudWebRtcModule} = NativeModules;

// Replacement for Channel/Chat.ts's mic handling in the native client --
// Chat.ts itself calls mediaDevices.getUserMedia()/sender.replaceTrack()
// against a real react-native-webrtc RTCPeerConnection, which doesn't exist
// here. The renegotiation this triggers (XcloudWebRtcClient's startMic/
// stopMic createOffer+setLocalDescription internally) surfaces through the
// native client's existing setSdpHandler wiring via the
// XcloudRenegotiationOffer event, exactly like Chat.ts's own
// sdpNegotiationChat() call did -- no change needed on that side.
export default class NativeChatChannel extends BaseChannel {
  isCapturing = false;
  isPaused = true;

  onOpen(event: any) {
    super.onOpen(event);
  }

  start() {
    // Do nothing -- matches Chat.ts's own start().
  }

  onMessage(_event: any) {
    // Chat.ts's own onMessage only JSON.parses incoming data for a debug
    // log; nothing in this app acts on it.
  }

  onClose(event: any) {
    super.onClose(event);
  }

  async startMic(): Promise<boolean> {
    if (!XcloudWebRtcModule) {
      return false;
    }
    const started = (await XcloudWebRtcModule.startMic()) ?? false;
    this.isCapturing = started;
    this.isPaused = !started;
    return started;
  }

  stopMic(): void {
    XcloudWebRtcModule?.stopMic();
    this.isCapturing = false;
    this.isPaused = true;
  }
}
