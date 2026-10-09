package com.xstreaming.psplus

import android.content.Context
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import com.facebook.react.bridge.ReactContext
import kotlin.math.roundToInt

/**
 * Hosts the video Surface a PsPlusModule.session decodes frames into, and
 * (as a ViewGroup wrapping that inner SurfaceView, rather than being one
 * itself) letterboxes/pillarboxes it to the stream's real aspect ratio
 * instead of stretching to fill this view's own RN-assigned bounds --
 * mirrors com.oney.WebRTCModule.RTCFsrVideoView's onLayout() (and the
 * patched react-native-webrtc WebRTCView.java fork it's paired with)
 * exactly, down to the videoFormat/screenPosition prop names and values,
 * so native-stream's Settings choices (screen_position/video_format) carry
 * over to this stream unchanged. AMediaCodec renders directly onto
 * whatever pixel rect this inner SurfaceView occupies (no OpenGL crop
 * step the way WebRTC's SurfaceViewRenderer has for its own "Zoom" mode),
 * so a larger-than-container "cover" layout relies on this ViewGroup's own
 * default child-clipping to crop the overflow -- no extra work needed.
 *
 * The inner SurfaceView attaches/detaches the native Surface as its own
 * SurfaceHolder is created/destroyed (e.g. backgrounding the app, screen
 * rotation) rather than once at mount, since a Session outlives any one
 * Surface across those.
 */
class PsPlusStreamView(context: Context) : ViewGroup(context) {

	private companion object {
		private const val TAG = "PsPlusStreamView"

		const val VIDEO_FORMAT_MODE_AUTO = 0
		const val VIDEO_FORMAT_MODE_STRETCH = 1
		const val VIDEO_FORMAT_MODE_ZOOM = 2
		const val VIDEO_FORMAT_MODE_FIXED_RATIO = 3

		const val SCREEN_POSITION_TOP = 0
		const val SCREEN_POSITION_CENTER = 1
		const val SCREEN_POSITION_BOTTOM = 2

		// PS5 cloud streaming's resolution presets (720p/1080p/1440p/2160p --
		// see cloudsession_gaikai.c's res_set table) are always 16:9. Unlike
		// WebRTC's renderer, which reads the actual decoded frame's width/
		// height/rotation per-frame (a generic WebRTC peer's video could be
		// any aspect or rotate), this decoder pipeline has no equivalent
		// per-frame signal, and none is needed: hardcoding 16:9 for the AUTO
		// case is exactly right for every resolution this app ever requests.
		const val FRAME_ASPECT_RATIO = 16f / 9f
	}

	private val innerSurfaceView = SurfaceView(context)

	private var videoFormatMode = VIDEO_FORMAT_MODE_AUTO
	private var videoFormatAspectRatio = 0f
	private var screenPositionMode = SCREEN_POSITION_CENTER

	init {
		// A plain SurfaceView punches a hole and composites on its own hardware
		// layer *below* the normal view hierarchy by default -- without this,
		// decoded video renders onto a Surface nothing else ever draws over
		// (screen looks solid black/whatever the window background is) even
		// though decoding itself is working fine, which is exactly why audio
		// still played. MediaOverlay (not OnTop) so this still stays under the
		// RN-rendered overlays (VirtualGamepad, PsPlusControlRail, ...), which
		// are ordinary Views drawn after it, not other SurfaceViews.
		innerSurfaceView.setZOrderMediaOverlay(true)
		innerSurfaceView.holder.addCallback(SurfaceCallback())
		addView(innerSurfaceView)
	}

	private val psPlusModule: PsPlusModule?
		get() = (context as? ReactContext)?.getNativeModule(PsPlusModule::class.java)

	private inner class SurfaceCallback : SurfaceHolder.Callback {
		override fun surfaceCreated(holder: SurfaceHolder) {
			// Timestamp + Surface identity, so a logcat capture across a
			// background/foreground cycle can confirm this and surfaceDestroyed()
			// below actually fire in the expected 1:1 pairing on the real device
			// -- see video-decoder.c's set_surface() for the matching native-side
			// branch-decision log this pairs with.
			Log.i(TAG, "surfaceCreated() at ${System.currentTimeMillis()}, surface=${System.identityHashCode(holder.surface)}")
			// Goes through attachSurface() (not a plain currentSurface write) so
			// this can never race with startSession() reading currentSurface and
			// publishing a fresh Session -- see PsPlusModule.surfaceLock.
			psPlusModule?.attachSurface(holder.surface)
		}

		override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

		override fun surfaceDestroyed(holder: SurfaceHolder) {
			Log.i(TAG, "surfaceDestroyed() at ${System.currentTimeMillis()}, surface=${System.identityHashCode(holder.surface)}")
			psPlusModule?.attachSurface(null)
		}
	}

	/** '' (auto) | "Stretch" | "Zoom" | "W:H" -- see cloudsession's video_format setting. */
	fun setVideoFormat(format: String?) {
		val normalized = format?.trim().orEmpty()
		val (mode, ratio) = when (normalized) {
			"" -> VIDEO_FORMAT_MODE_AUTO to 0f
			"Stretch" -> VIDEO_FORMAT_MODE_STRETCH to 0f
			"Zoom" -> VIDEO_FORMAT_MODE_ZOOM to 0f
			else -> {
				val parsed = parseVideoAspectRatio(normalized)
				if (parsed > 0f) VIDEO_FORMAT_MODE_FIXED_RATIO to parsed
				else VIDEO_FORMAT_MODE_AUTO to 0f
			}
		}
		if (mode == videoFormatMode && ratio == videoFormatAspectRatio) return
		videoFormatMode = mode
		videoFormatAspectRatio = ratio
		requestLayout()
	}

	/** "top" | "center" | "bottom" -- vertical anchor; horizontal is always centered. */
	fun setScreenPosition(position: String?) {
		val mode = when (position?.trim()) {
			"top" -> SCREEN_POSITION_TOP
			"bottom" -> SCREEN_POSITION_BOTTOM
			else -> SCREEN_POSITION_CENTER
		}
		if (mode == screenPositionMode) return
		screenPositionMode = mode
		requestLayout()
	}

	private fun parseVideoAspectRatio(format: String): Float = when (format) {
		"16:10" -> 16f / 10f
		"18:9" -> 18f / 9f
		"20:9" -> 20f / 9f
		"21:9" -> 21f / 9f
		"4:3" -> 4f / 3f
		else -> {
			val parts = format.split(":")
			if (parts.size == 2) {
				val w = parts[0].toFloatOrNull()
				val h = parts[1].toFloatOrNull()
				if (w != null && h != null && w > 0f && h > 0f) w / h else 0f
			} else 0f
		}
	}

	// No onMeasure() override, matching RTCFsrVideoView.java's own approach:
	// onLayout() below lays the inner SurfaceView out with absolute
	// coordinates directly, and a SurfaceView's underlying Surface tracks
	// its view's actual layout bounds regardless of whether measure() was
	// ever called on it.
	override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
		val width = r - l
		val height = b - t
		if (width <= 0 || height <= 0) {
			innerSurfaceView.layout(0, 0, 0, 0)
			return
		}

		if (videoFormatMode == VIDEO_FORMAT_MODE_STRETCH) {
			innerSurfaceView.layout(0, 0, width, height)
			return
		}

		val targetAspectRatio =
			if (videoFormatMode == VIDEO_FORMAT_MODE_FIXED_RATIO) videoFormatAspectRatio
			else FRAME_ASPECT_RATIO
		val cover = videoFormatMode == VIDEO_FORMAT_MODE_ZOOM
		val (displayWidth, displayHeight) = computeDisplaySize(targetAspectRatio, width, height, cover)

		val verticalSpace = height - displayHeight
		val left = (width - displayWidth) / 2
		val top = when (screenPositionMode) {
			SCREEN_POSITION_TOP -> 0
			SCREEN_POSITION_BOTTOM -> verticalSpace
			else -> verticalSpace / 2
		}
		innerSurfaceView.layout(left, top, left + displayWidth, top + displayHeight)
	}

	// "Contain" (letterbox, cover=false) or "cover" (fill-and-crop, cover=true)
	// fit of an aspect-ratio box within maxWidth x maxHeight -- standard
	// CSS object-fit math (same result as WebRTC's own
	// RendererCommon.getDisplaySize(), just computed directly since there's
	// no equivalent helper in the NDK/AMediaCodec APIs this pipeline uses).
	// A "cover" result can exceed maxWidth/maxHeight on one axis by design;
	// the ViewGroup's own default child-clipping crops that overflow.
	private fun computeDisplaySize(
		targetAspectRatio: Float,
		maxWidth: Int,
		maxHeight: Int,
		cover: Boolean,
	): Pair<Int, Int> {
		if (targetAspectRatio <= 0f) return maxWidth to maxHeight
		val containerAspectRatio = maxWidth.toFloat() / maxHeight.toFloat()
		val widthConstrained = (targetAspectRatio > containerAspectRatio) == !cover
		return if (widthConstrained) {
			maxWidth to (maxWidth / targetAspectRatio).roundToInt()
		} else {
			(maxHeight * targetAspectRatio).roundToInt() to maxHeight
		}
	}
}
