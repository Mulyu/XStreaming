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
		// Cached regardless of whether a session exists yet -- startSession()
		// reads this back for a session created after this view already
		// mounted, which is the common case (see PsPlusModule.currentSurface).
		psPlusModule?.currentSurface = holder.surface
		psPlusModule?.session?.setSurface(holder.surface)
	}

	override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

	override fun surfaceDestroyed(holder: SurfaceHolder) {
		psPlusModule?.currentSurface = null
		psPlusModule?.session?.setSurface(null)
	}
}
