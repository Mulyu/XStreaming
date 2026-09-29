package com.xstreaming.psplus

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import com.facebook.react.bridge.ReactContext

/**
 * Hosts the video Surface a PsPlusModule.session decodes frames into.
 * Attaches/detaches the Surface as this view's SurfaceTexture is
 * available/destroyed (e.g. backgrounding the app, screen rotation) rather
 * than once at mount, since a Session outlives any one Surface across those.
 *
 * TextureView, not SurfaceView: a plain SurfaceView punches a transparent
 * hole in the window so the SurfaceFlinger-composited Surface shows through
 * underneath, but that hole-punch routinely fails to composite reliably
 * inside a React Native view tree (a well-known RN-specific caveat -- it's
 * why RN camera/video libraries default to TextureView), which is exactly
 * why the video stayed solid black while audio kept working even after
 * trying every SurfaceView z-order flag. TextureView instead renders as an
 * ordinary View texture, so it follows normal view draw order like any
 * other RN view -- no z-order tricks needed for the VirtualGamepad/
 * PsPlusControlRail overlays to appear above it.
 */
class PsPlusStreamView(context: Context) :
	TextureView(context),
	TextureView.SurfaceTextureListener {

	private var surface: Surface? = null

	init {
		surfaceTextureListener = this
	}

	private val psPlusModule: PsPlusModule?
		get() = (context as? ReactContext)?.getNativeModule(PsPlusModule::class.java)

	override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
		val newSurface = Surface(texture)
		surface = newSurface
		psPlusModule?.currentSurface = newSurface
		psPlusModule?.session?.setSurface(newSurface)
	}

	override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) {}

	override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {}

	override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
		psPlusModule?.currentSurface = null
		psPlusModule?.session?.setSurface(null)
		surface?.release()
		surface = null
		// We release the Surface ourselves above (ahead of the codec being
		// told to stop using it via setSurface(null)), so it's safe to tell
		// the system to release the underlying SurfaceTexture too.
		return true
	}
}
