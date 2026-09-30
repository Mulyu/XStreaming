package com.xstreaming.psplus

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.facebook.react.bridge.ReactContext

/**
 * Hosts the video Surface a PsPlusModule.session decodes frames into.
 * Attaches/detaches the Surface as this view's SurfaceHolder is created/
 * destroyed (e.g. backgrounding the app, screen rotation) rather than once
 * at mount, since a Session outlives any one Surface across those.
 *
 * Back to SurfaceView (not TextureView): TextureView was tried to fix video
 * rendering as solid black, but it introduced a launch crash that couldn't
 * be root-caused without a device log, which nobody could provide. This
 * exact SurfaceView-based version never crashed across this whole project,
 * so stability wins here -- the black-video issue is worth another look,
 * but not at the cost of every launch crashing.
 */
class PsPlusStreamView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

	init {
		// A plain SurfaceView punches a hole and composites on its own hardware
		// layer *below* the normal view hierarchy by default -- without this,
		// decoded video renders onto a Surface nothing else ever draws over
		// (screen looks solid black/whatever the window background is) even
		// though decoding itself is working fine, which is exactly why audio
		// still played. MediaOverlay (not OnTop) so this still stays under the
		// RN-rendered overlays (VirtualGamepad, PsPlusControlRail, ...), which
		// are ordinary Views drawn after it, not other SurfaceViews.
		setZOrderMediaOverlay(true)
		holder.addCallback(this)
	}

	private val psPlusModule: PsPlusModule?
		get() = (context as? ReactContext)?.getNativeModule(PsPlusModule::class.java)

	override fun surfaceCreated(holder: SurfaceHolder) {
		// Goes through attachSurface() (not a plain currentSurface write) so
		// this can never race with startSession() reading currentSurface and
		// publishing a fresh Session -- see PsPlusModule.surfaceLock.
		psPlusModule?.attachSurface(holder.surface)
	}

	override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

	override fun surfaceDestroyed(holder: SurfaceHolder) {
		psPlusModule?.attachSurface(null)
	}
}
