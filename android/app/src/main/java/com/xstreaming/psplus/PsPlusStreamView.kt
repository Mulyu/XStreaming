package com.xstreaming.psplus

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.facebook.react.bridge.ReactContext
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

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

	// TEMPORARY, alongside PsPlusModule's own surfaceCreatedCalls -- a
	// process-wide counter independent of the (context as? ReactContext)
	// cast and getNativeModule() lookup below, so a getSurfaceDebugInfo()
	// reading of 0 can be told apart from "surfaceCreated() never fired at
	// all" vs. "it fired, but psPlusModule resolved to null every time and
	// attachSurface() was silently never called". Static/companion so it
	// survives even if this exact View instance can't resolve its module.
	companion object {
		val rawSurfaceCreatedCalls = AtomicInteger(0)
		val rawPsPlusModuleNullCount = AtomicInteger(0)
		// TEMPORARY: surfaceCreatedCalls=0 on the instance getSurfaceDebugInfo()
		// answers from, vs. rawSurfaceCreatedCalls>0 with rawPsPlusModuleNullCount=0,
		// is only possible if attachSurface() really did run 4 times (moduleNull=0
		// means the lookup below never failed) but on a DIFFERENT PsPlusModule
		// object than the one the JS bridge resolves -- i.e. two live instances
		// that don't share state, not a single misbehaving one. identityHashCode
		// of whichever instance last actually ran attachSurface(), to compare
		// directly against getSurfaceDebugInfo()'s own `this`.
		val lastAttachedModuleId = AtomicInteger(0)
		// TEMPORARY: lastAttachedModuleId staying 0 despite
		// rawSurfaceCreatedCalls>0 and rawPsPlusModuleNullCount=0 is only
		// possible if something throws BEFORE either of those lines runs --
		// i.e. resolving psPlusModule itself (the getNativeModule() call)
		// throwing, not returning null. Nothing below caught that until now,
		// so if that's really happening it was either crashing (not observed)
		// or being swallowed somewhere upstream in Android/RN's own view
		// mounting code. Catching it here answers which, and captures what it
		// actually is.
		val lastSurfaceCreatedError = AtomicReference<String?>(null)
	}

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
		rawSurfaceCreatedCalls.incrementAndGet()
		try {
			// Goes through attachSurface() (not a plain currentSurface write) so
			// this can never race with startSession() reading currentSurface and
			// publishing a fresh Session -- see PsPlusModule.surfaceLock.
			val module = psPlusModule
			if (module == null) {
				rawPsPlusModuleNullCount.incrementAndGet()
			} else {
				lastAttachedModuleId.set(System.identityHashCode(module))
				module.attachSurface(holder.surface)
			}
		} catch (e: Throwable) {
			lastSurfaceCreatedError.set("${e.javaClass.simpleName}: ${e.message}")
		}
	}

	override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
		psPlusModule?.noteSurfaceChanged(width, height)
	}

	override fun surfaceDestroyed(holder: SurfaceHolder) {
		psPlusModule?.attachSurface(null)
	}
}
