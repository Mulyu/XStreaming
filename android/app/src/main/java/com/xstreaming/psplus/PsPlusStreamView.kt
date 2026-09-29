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
		holder.addCallback(this)
	}

	private val psPlusModule: PsPlusModule?
		get() = (context as? ReactContext)?.getNativeModule(PsPlusModule::class.java)

	override fun surfaceCreated(holder: SurfaceHolder) {
		psPlusModule?.session?.setSurface(holder.surface)
	}

	override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

	override fun surfaceDestroyed(holder: SurfaceHolder) {
		psPlusModule?.session?.setSurface(null)
	}
}
