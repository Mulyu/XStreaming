package com.xstreaming.webrtc

import org.webrtc.VideoTrack
import java.util.concurrent.ConcurrentHashMap

/**
 * Lets a remote VideoTrack created by one of this app's own native WebRTC
 * clients (GfnWebRtcClient, XcloudWebRtcClient -- both build their own
 * PeerConnectionFactory, separate from react-native-webrtc's) reach
 * RTCFsrVideoView by id instead of by react-native-webrtc's own
 * MediaStream/streamURL registry, which only knows about tracks created
 * through its own RTCPeerConnection. See RTCFsrVideoView#setNativeTrackId.
 */
object NativeVideoTrackHolder {
    private val tracks = ConcurrentHashMap<String, VideoTrack>()

    fun setTrack(id: String, track: VideoTrack) {
        tracks[id] = track
    }

    fun getTrack(id: String): VideoTrack? = tracks[id]

    fun clearTrack(id: String) {
        tracks.remove(id)
    }
}
