package com.xstreaming.gfn

import android.content.Context
import android.media.AudioAttributes
import com.oney.WebRTCModule.EglUtils
import com.oney.WebRTCModule.WebRTCModuleOptions
import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoDecoderFactory
import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoEncoderFactory
import com.xstreaming.AudioConfig
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import org.webrtc.SoftwareVideoDecoderFactory
import org.webrtc.SoftwareVideoEncoderFactory
import org.webrtc.VideoDecoderFactory
import org.webrtc.VideoEncoderFactory
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * One process-wide [PeerConnectionFactory], shared by both GFN
 * (GfnWebRtcClient) and xCloud (com.xstreaming.xcloud.XcloudWebRtcClient) --
 * one factory per process is correct WebRTC practice, and the comment below
 * about only one of the two ever streaming at a time already assumed this.
 * Built the same way react-native-webrtc's own WebRTCModule builds its
 * (separate) factory:
 * same shared EGL context ([EglUtils.getRootEglBaseContext], so video frames
 * decoded here stay renderable by [com.xstreaming.fsr.FsrVideoProcessor]'s
 * own GL context) and the SAME video encoder/decoder factory objects this
 * app already configured once in MainApplication (its H264AndSoftware* +
 * LowLatencyVideoDecoderFactory setup, held on [WebRTCModuleOptions]) --
 * codec factories are stateless per-call producers, safe to share across
 * more than one PeerConnectionFactory.
 *
 * The audio device module is NOT shared: react-native-webrtc's own
 * WebRTCModule calls adm.release() on WebRTCModuleOptions' ADM right after
 * handing it to its factory ("PeerConnectionFactory now owns the adm native
 * pointer"), so reusing that same instance here would race whichever side
 * initializes last. A second JavaAudioDeviceModule, configured with this
 * app's own stereo/low-latency settings, costs little and avoids that.
 *
 * Only one of GFN or xCloud ever streams at a time in this app, so running
 * two PeerConnectionFactory instances side by side (this one, and react-
 * native-webrtc's own) is a one-time setup cost, not a steady-state one.
 */
object GfnWebRtcFactory {
    @Volatile
    private var factory: PeerConnectionFactory? = null
    private val lock = Any()

    fun get(context: Context): PeerConnectionFactory {
        factory?.let { return it }
        synchronized(lock) {
            factory?.let { return it }
            val created = build(context.applicationContext)
            factory = created
            return created
        }
    }

    fun eglContext(): EglBase.Context? = EglUtils.getRootEglBaseContext()

    private fun build(appContext: Context): PeerConnectionFactory {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions(),
        )

        val options = WebRTCModuleOptions.getInstance()
        val eglContext = EglUtils.getRootEglBaseContext()

        val encoderFactory: VideoEncoderFactory = options.videoEncoderFactory
            ?: if (eglContext != null) H264AndSoftwareVideoEncoderFactory(eglContext) else SoftwareVideoEncoderFactory()
        val decoderFactory: VideoDecoderFactory = options.videoDecoderFactory
            ?: if (eglContext != null) H264AndSoftwareVideoDecoderFactory(eglContext) else SoftwareVideoDecoderFactory()

        val stereoEnabled = AudioConfig.isStereoEnabled(appContext)
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        val adm = JavaAudioDeviceModule.builder(appContext)
            .setAudioAttributes(audioAttributes)
            .setEnableVolumeLogger(false)
            .setUseLowLatency(true)
            .setUseStereoInput(stereoEnabled)
            .setUseStereoOutput(stereoEnabled)
            .createAudioDeviceModule()

        val built = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .setAudioDeviceModule(adm)
            .createPeerConnectionFactory()
        adm.release()
        return built
    }
}
